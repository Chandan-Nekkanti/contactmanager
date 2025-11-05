from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone
import pandas as pd
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    column_schema: List[str] = []  # Store column names from Excel

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Contact(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow dynamic fields
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data: Dict[str, Any] = {}  # Dynamic contact data

class ContactCreate(BaseModel):
    group_id: str
    data: Dict[str, Any]

class ContactUpdate(BaseModel):
    data: Dict[str, Any]

# Group Routes
@api_router.post("/groups", response_model=Group)
async def create_group(input: GroupCreate):
    group_obj = Group(**input.model_dump())
    
    doc = group_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.groups.insert_one(doc)
    return group_obj

@api_router.get("/groups", response_model=List[Group])
async def get_groups():
    groups = await db.groups.find({}, {"_id": 0}).to_list(1000)
    
    for group in groups:
        if isinstance(group['created_at'], str):
            group['created_at'] = datetime.fromisoformat(group['created_at'])
    
    return groups

@api_router.get("/groups/{group_id}", response_model=Group)
async def get_group(group_id: str):
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if isinstance(group['created_at'], str):
        group['created_at'] = datetime.fromisoformat(group['created_at'])
    
    return group

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    # Delete group and all its contacts
    await db.groups.delete_one({"id": group_id})
    await db.contacts.delete_many({"group_id": group_id})
    return {"message": "Group and contacts deleted successfully"}

@api_router.put("/groups/{group_id}/schema")
async def update_group_schema(group_id: str, schema_data: dict):
    result = await db.groups.update_one(
        {"id": group_id},
        {"$set": {"column_schema": schema_data.get("column_schema", [])}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return {"message": "Schema updated successfully"}

# Contact Routes
@api_router.get("/contacts/{group_id}")
async def get_contacts(group_id: str):
    contacts = await db.contacts.find({"group_id": group_id}, {"_id": 0}).to_list(10000)
    
    for contact in contacts:
        if isinstance(contact.get('created_at'), str):
            contact['created_at'] = datetime.fromisoformat(contact['created_at'])
    
    return contacts

@api_router.post("/contacts", response_model=Contact)
async def create_contact(input: ContactCreate):
    contact_obj = Contact(**input.model_dump())
    
    doc = contact_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.contacts.insert_one(doc)
    return contact_obj

@api_router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, input: ContactUpdate):
    result = await db.contacts.update_one(
        {"id": contact_id},
        {"$set": {"data": input.data}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return {"message": "Contact updated successfully"}

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    result = await db.contacts.delete_one({"id": contact_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return {"message": "Contact deleted successfully"}

# Excel Import Route
@api_router.post("/groups/{group_id}/import-excel")
async def import_excel(group_id: str, file: UploadFile = File(...)):
    try:
        # Check if group exists
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Read Excel file
        contents = await file.read()
        
        # Try to read as Excel or CSV
        try:
            if file.filename.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(contents))
            else:
                df = pd.read_excel(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
        
        # Get column names
        columns = df.columns.tolist()
        
        # Update group schema
        await db.groups.update_one(
            {"id": group_id},
            {"$set": {"column_schema": columns}}
        )
        
        # Convert DataFrame to contacts
        contacts_imported = 0
        for _, row in df.iterrows():
            # Convert row to dictionary, handling NaN values
            contact_data = {}
            for col in columns:
                value = row[col]
                # Handle NaN, None, and convert to appropriate types
                if pd.isna(value):
                    contact_data[col] = ""
                else:
                    contact_data[col] = str(value)
            
            contact = Contact(
                group_id=group_id,
                data=contact_data
            )
            
            doc = contact.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            
            await db.contacts.insert_one(doc)
            contacts_imported += 1
        
        return {
            "message": f"Successfully imported {contacts_imported} contacts",
            "columns": columns,
            "count": contacts_imported
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

# Export Route
@api_router.get("/groups/{group_id}/export")
async def export_contacts(group_id: str):
    try:
        # Get group
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Get contacts
        contacts = await db.contacts.find({"group_id": group_id}, {"_id": 0}).to_list(10000)
        
        if not contacts:
            return {"data": [], "columns": []}
        
        # Extract data
        data_list = [contact['data'] for contact in contacts]
        columns = group.get('column_schema', [])
        
        return {"data": data_list, "columns": columns}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting contacts: {str(e)}")

# Search Route
@api_router.get("/contacts/{group_id}/search")
async def search_contacts(group_id: str, q: str):
    contacts = await db.contacts.find({"group_id": group_id}, {"_id": 0}).to_list(10000)
    
    # Filter contacts based on search query
    filtered_contacts = []
    for contact in contacts:
        # Search in all data fields
        for value in contact.get('data', {}).values():
            if q.lower() in str(value).lower():
                filtered_contacts.append(contact)
                break
    
    return filtered_contacts

@api_router.get("/")
async def root():
    return {"message": "Contacts Manager API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()