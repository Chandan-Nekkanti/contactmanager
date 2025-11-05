import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Trash2, Search, Download, Edit, Users, FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [isDefineFieldsOpen, setIsDefineFieldsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [newContactData, setNewContactData] = useState({});
  const [loading, setLoading] = useState(false);
  const [customFields, setCustomFields] = useState([]);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchContacts(selectedGroup.id);
    }
  }, [selectedGroup]);

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups`);
      setGroups(response.data);
    } catch (e) {
      console.error("Error fetching groups:", e);
      toast.error("Failed to fetch groups");
    }
  };

  const fetchContacts = async (groupId) => {
    try {
      const response = await axios.get(`${API}/contacts/${groupId}`);
      setContacts(response.data);
    } catch (e) {
      console.error("Error fetching contacts:", e);
      toast.error("Failed to fetch contacts");
    }
  };

  const createGroup = async () => {
    if (!newGroup.name.trim()) {
      toast.error("Group name is required");
      return;
    }

    try {
      const response = await axios.post(`${API}/groups`, newGroup);
      setGroups([...groups, response.data]);
      setNewGroup({ name: "", description: "" });
      setIsCreateGroupOpen(false);
      toast.success("Group created successfully");
    } catch (e) {
      console.error("Error creating group:", e);
      toast.error("Failed to create group");
    }
  };

  const deleteGroup = async (groupId) => {
    if (!window.confirm("Are you sure? This will delete all contacts in this group.")) {
      return;
    }

    try {
      await axios.delete(`${API}/groups/${groupId}`);
      setGroups(groups.filter(g => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setContacts([]);
      }
      toast.success("Group deleted successfully");
    } catch (e) {
      console.error("Error deleting group:", e);
      toast.error("Failed to delete group");
    }
  };

  const handleFileUpload = async (event, groupId) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const response = await axios.post(`${API}/groups/${groupId}/import-excel`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      toast.success(response.data.message);
      
      // Refresh group to get updated schema
      const groupResponse = await axios.get(`${API}/groups/${groupId}`);
      setGroups(groups.map(g => g.id === groupId ? groupResponse.data : g));
      
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(groupResponse.data);
        fetchContacts(groupId);
      }
    } catch (e) {
      console.error("Error uploading file:", e);
      toast.error(e.response?.data?.detail || "Failed to upload file");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  };

  const addContact = async () => {
    if (!selectedGroup) return;

    // Check if all fields are filled
    const hasEmptyFields = Object.values(newContactData).some(v => !v?.toString().trim());
    if (hasEmptyFields || Object.keys(newContactData).length === 0) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      await axios.post(`${API}/contacts`, {
        group_id: selectedGroup.id,
        data: newContactData
      });
      
      fetchContacts(selectedGroup.id);
      setNewContactData({});
      setIsAddContactOpen(false);
      toast.success("Contact added successfully");
    } catch (e) {
      console.error("Error adding contact:", e);
      toast.error("Failed to add contact");
    }
  };

  const updateContact = async () => {
    if (!editingContact) return;

    try {
      await axios.put(`${API}/contacts/${editingContact.id}`, {
        data: newContactData
      });
      
      fetchContacts(selectedGroup.id);
      setEditingContact(null);
      setNewContactData({});
      setIsEditContactOpen(false);
      toast.success("Contact updated successfully");
    } catch (e) {
      console.error("Error updating contact:", e);
      toast.error("Failed to update contact");
    }
  };

  const deleteContact = async (contactId) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) {
      return;
    }

    try {
      await axios.delete(`${API}/contacts/${contactId}`);
      setContacts(contacts.filter(c => c.id !== contactId));
      toast.success("Contact deleted successfully");
    } catch (e) {
      console.error("Error deleting contact:", e);
      toast.error("Failed to delete contact");
    }
  };

  const openEditContact = (contact) => {
    setEditingContact(contact);
    setNewContactData({ ...contact.data });
    setIsEditContactOpen(true);
  };

  const exportContacts = async () => {
    if (!selectedGroup) return;

    try {
      const response = await axios.get(`${API}/groups/${selectedGroup.id}/export`);
      
      if (response.data.data.length === 0) {
        toast.error("No contacts to export");
        return;
      }

      // Convert to CSV
      const columns = response.data.columns;
      const data = response.data.data;
      
      let csv = columns.join(",") + "\n";
      data.forEach(row => {
        csv += columns.map(col => `"${row[col] || ""}"`).join(",") + "\n";
      });

      // Download
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedGroup.name}_contacts.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success("Contacts exported successfully");
    } catch (e) {
      console.error("Error exporting contacts:", e);
      toast.error("Failed to export contacts");
    }
  };

  const handleSearch = async () => {
    if (!selectedGroup || !searchQuery.trim()) {
      fetchContacts(selectedGroup.id);
      return;
    }

    try {
      const response = await axios.get(`${API}/contacts/${selectedGroup.id}/search?q=${encodeURIComponent(searchQuery)}`);
      setContacts(response.data);
    } catch (e) {
      console.error("Error searching contacts:", e);
      toast.error("Failed to search contacts");
    }
  };

  const openAddContact = () => {
    if (!selectedGroup || selectedGroup.column_schema.length === 0) {
      // Open field definition dialog instead
      setIsDefineFieldsOpen(true);
      return;
    }
    
    // Initialize empty form data based on schema
    const emptyData = {};
    selectedGroup.column_schema.forEach(col => {
      emptyData[col] = "";
    });
    setNewContactData(emptyData);
    setIsAddContactOpen(true);
  };

  const defineCustomFields = async () => {
    if (customFields.length === 0) {
      toast.error("Please add at least one field");
      return;
    }

    try {
      // Update group schema
      await axios.put(`${API}/groups/${selectedGroup.id}/schema`, {
        column_schema: customFields
      });
      
      // Refresh group
      const groupResponse = await axios.get(`${API}/groups/${selectedGroup.id}`);
      setGroups(groups.map(g => g.id === selectedGroup.id ? groupResponse.data : g));
      setSelectedGroup(groupResponse.data);
      
      setCustomFields([]);
      setIsDefineFieldsOpen(false);
      toast.success("Fields defined successfully");
      
      // Now open add contact dialog
      const emptyData = {};
      customFields.forEach(col => {
        emptyData[col] = "";
      });
      setNewContactData(emptyData);
      setIsAddContactOpen(true);
    } catch (e) {
      console.error("Error defining fields:", e);
      toast.error("Failed to define fields");
    }
  };

  const addCustomField = () => {
    const fieldName = prompt("Enter field name:");
    if (fieldName && fieldName.trim()) {
      setCustomFields([...customFields, fieldName.trim()]);
    }
  };

  const removeCustomField = (index) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const filteredContacts = searchQuery ? contacts : contacts;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Contact Manager</h1>
                <p className="text-sm text-slate-500">Organize contacts by groups</p>
              </div>
            </div>
            
            <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-group-btn" className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="create-group-dialog">
                <DialogHeader>
                  <DialogTitle>Create New Group</DialogTitle>
                  <DialogDescription>Add a new group to organize your contacts</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Group Name</label>
                    <Input
                      data-testid="group-name-input"
                      placeholder="e.g., Family, Work, Friends"
                      value={newGroup.name}
                      onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
                    <Textarea
                      data-testid="group-description-input"
                      placeholder="Brief description of this group"
                      value={newGroup.description}
                      onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    />
                  </div>
                  <Button data-testid="create-group-submit-btn" onClick={createGroup} className="w-full">
                    Create Group
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
          {/* Sidebar - Groups */}
          <div className={`lg:col-span-1 transition-all duration-300 ${!isSidebarExpanded ? 'hidden lg:block lg:w-16' : ''}`}>
            <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm relative">
              {/* Toggle Button */}
              <Button
                data-testid="toggle-sidebar-btn"
                onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                variant="ghost"
                size="sm"
                className="absolute -right-3 top-4 z-10 bg-white border-2 border-slate-200 rounded-full w-8 h-8 p-0 shadow-md hover:shadow-lg hidden lg:flex items-center justify-center"
              >
                {isSidebarExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>

              {isSidebarExpanded ? (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5" />
                      Groups
                    </CardTitle>
                    <CardDescription>Select a group to view contacts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {groups.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No groups yet</p>
                        </div>
                      ) : (
                        groups.map((group) => (
                          <div
                            key={group.id}
                            data-testid={`group-item-${group.id}`}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                              selectedGroup?.id === group.id
                                ? "border-indigo-500 bg-indigo-50 shadow-md"
                                : "border-slate-200 hover:border-indigo-300 bg-white"
                            }`}
                            onClick={() => setSelectedGroup(group)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-800">{group.name}</h3>
                                {group.description && (
                                  <p className="text-xs text-slate-500 mt-1">{group.description}</p>
                                )}
                                {group.column_schema && group.column_schema.length > 0 && (
                                  <Badge variant="secondary" className="mt-2 text-xs">
                                    {group.column_schema.length} fields
                                  </Badge>
                                )}
                              </div>
                              <Button
                                data-testid={`delete-group-btn-${group.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteGroup(group.id);
                                }}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="p-4">
                  <div className="flex flex-col items-center gap-4 mt-8">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        data-testid={`group-icon-${group.id}`}
                        onClick={() => setSelectedGroup(group)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                          selectedGroup?.id === group.id
                            ? "bg-indigo-600 text-white shadow-lg"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                        title={group.name}
                      >
                        <FolderOpen className="w-5 h-5" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Main Content - Contacts */}
          <div className={`transition-all duration-300 ${isSidebarExpanded ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
            {!selectedGroup ? (
              <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
                <CardContent className="py-20">
                  <div className="text-center text-slate-400">
                    <Users className="w-20 h-20 mx-auto mb-4 opacity-30" />
                    <h3 className="text-xl font-semibold mb-2">No Group Selected</h3>
                    <p>Select a group from the sidebar or create a new one to get started</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedGroup.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <label htmlFor="file-upload">
                        <Button data-testid="import-excel-btn" asChild variant="outline" disabled={loading}>
                          <span>
                            <Upload className="w-4 h-4 mr-2" />
                            {loading ? "Importing..." : "Import Excel"}
                          </span>
                        </Button>
                      </label>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleFileUpload(e, selectedGroup.id)}
                        className="hidden"
                      />
                      
                      <Button data-testid="add-contact-btn" onClick={openAddContact} variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Contact
                      </Button>
                      
                      <Button data-testid="export-contacts-btn" onClick={exportContacts} variant="outline" disabled={contacts.length === 0}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                  
                  {/* Search Bar */}
                  <div className="flex gap-2 mt-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        data-testid="search-input"
                        placeholder="Search contacts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-9"
                      />
                    </div>
                    <Button data-testid="search-btn" onClick={handleSearch}>
                      Search
                    </Button>
                    {searchQuery && (
                      <Button data-testid="clear-search-btn" variant="outline" onClick={() => { setSearchQuery(""); fetchContacts(selectedGroup.id); }}>
                        Clear
                      </Button>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent>
                  {contacts.length === 0 && selectedGroup.column_schema.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Upload className="w-16 h-16 mx-auto mb-3 opacity-30" />
                      <h3 className="text-lg font-semibold mb-2">No Structure Defined</h3>
                      <p className="text-sm mb-4">Import an Excel file to define the contact structure</p>
                      <label htmlFor="file-upload-empty">
                        <Button data-testid="import-excel-empty-btn" asChild>
                          <span>
                            <Upload className="w-4 h-4 mr-2" />
                            Import Excel File
                          </span>
                        </Button>
                      </label>
                      <input
                        id="file-upload-empty"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleFileUpload(e, selectedGroup.id)}
                        className="hidden"
                      />
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
                      <h3 className="text-lg font-semibold mb-2">No Contacts Yet</h3>
                      <p className="text-sm mb-4">Add your first contact to this group</p>
                      <Button data-testid="add-first-contact-btn" onClick={openAddContact}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Contact
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                              {selectedGroup.column_schema.map((col) => (
                                <TableHead key={col} className="font-bold text-slate-700 border-r border-slate-200 last:border-r-0">{col}</TableHead>
                              ))}
                              <TableHead className="text-right font-bold text-slate-700">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredContacts.map((contact, index) => (
                              <TableRow 
                                key={contact.id} 
                                data-testid={`contact-row-${contact.id}`}
                                className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-indigo-50/50 border-b border-slate-200`}
                              >
                                {selectedGroup.column_schema.map((col) => (
                                  <TableCell key={col} className="border-r border-slate-200 last:border-r-0 font-medium text-slate-700">
                                    {contact.data[col] || "-"}
                                  </TableCell>
                                ))}
                                <TableCell className="text-right">
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      data-testid={`edit-contact-btn-${contact.id}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditContact(contact)}
                                      className="hover:bg-blue-50 hover:text-blue-700"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      data-testid={`delete-contact-btn-${contact.id}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteContact(contact.id)}
                                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
        <DialogContent data-testid="add-contact-dialog">
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>Fill in the contact information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            {selectedGroup?.column_schema.map((col) => (
              <div key={col}>
                <label className="text-sm font-medium mb-2 block">{col}</label>
                <Input
                  data-testid={`add-contact-field-${col}`}
                  placeholder={`Enter ${col}`}
                  value={newContactData[col] || ""}
                  onChange={(e) => setNewContactData({ ...newContactData, [col]: e.target.value })}
                />
              </div>
            ))}
            <Button data-testid="add-contact-submit-btn" onClick={addContact} className="w-full">
              Add Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
        <DialogContent data-testid="edit-contact-dialog">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update the contact information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            {selectedGroup?.column_schema.map((col) => (
              <div key={col}>
                <label className="text-sm font-medium mb-2 block">{col}</label>
                <Input
                  data-testid={`edit-contact-field-${col}`}
                  placeholder={`Enter ${col}`}
                  value={newContactData[col] || ""}
                  onChange={(e) => setNewContactData({ ...newContactData, [col]: e.target.value })}
                />
              </div>
            ))}
            <Button data-testid="edit-contact-submit-btn" onClick={updateContact} className="w-full">
              Update Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Define Fields Dialog */}
      <Dialog open={isDefineFieldsOpen} onOpenChange={setIsDefineFieldsOpen}>
        <DialogContent data-testid="define-fields-dialog">
          <DialogHeader>
            <DialogTitle>Define Contact Fields</DialogTitle>
            <DialogDescription>Add fields for your contacts (e.g., Name, Phone, Email)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 min-h-[100px]">
              {customFields.length === 0 ? (
                <p className="text-sm text-slate-400 text-center">No fields added yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customFields.map((field, index) => (
                    <Badge key={index} variant="secondary" className="text-sm px-3 py-1">
                      {field}
                      <button
                        onClick={() => removeCustomField(index)}
                        className="ml-2 text-slate-500 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <Button 
              data-testid="add-field-btn" 
              onClick={addCustomField} 
              variant="outline" 
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
            
            <Button 
              data-testid="define-fields-submit-btn" 
              onClick={defineCustomFields} 
              className="w-full"
              disabled={customFields.length === 0}
            >
              Save Fields & Add Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;