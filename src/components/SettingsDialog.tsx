import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { Shield, Database, Bell, User, Trash2, Edit, UserCog, UserX, UserCheck, UserPlus } from 'lucide-react';
import type { Connection } from '../App';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: Connection[];
  onUpdateConnections: (connections: Connection[]) => void;
  defaultTab?: string;
  onDefaultTabChange?: (tab: string) => void;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'User' | 'Moderator';
  status: 'active' | 'suspended';
}

export function SettingsDialog({ open, onOpenChange, connections: initialConnections, onUpdateConnections, defaultTab = 'general', onDefaultTabChange }: SettingsDialogProps) {
  const [adminSettings, setAdminSettings] = useState({
    allowNewUsers: true,
    requireApproval: false,
    enableNotifications: true,
    maxMessageLength: '5000',
  });

  const [connections, setConnections] = useState<Connection[]>(initialConnections);

  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'Admin User', email: 'admin@example.com', role: 'Admin', status: 'active' },
    { id: '2', name: 'John Doe', email: 'john@example.com', role: 'User', status: 'active' },
    { id: '3', name: 'Jane Smith', email: 'jane@example.com', role: 'User', status: 'active' },
    { id: '4', name: 'Mike Johnson', email: 'mike@example.com', role: 'Moderator', status: 'active' },
  ]);

  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null);
  const [managingUser, setManagingUser] = useState<User | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  
  const [newConnection, setNewConnection] = useState({
    name: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
  });

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'User' as 'Admin' | 'User' | 'Moderator',
  });

  // Sync connections when prop changes or dialog opens
  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections, open]);

  const handleDeleteConnection = (id: string) => {
    const updatedConnections = connections.filter(conn => conn.id !== id);
    setConnections(updatedConnections);
    onUpdateConnections(updatedConnections);
    setDeleteConnectionId(null);
  };

  const handleSaveConnection = () => {
    if (editingConnection) {
      const updatedConnections = connections.map(conn => 
        conn.id === editingConnection.id ? editingConnection : conn
      );
      setConnections(updatedConnections);
      onUpdateConnections(updatedConnections);
      setEditingConnection(null);
    }
  };

  const handleAddConnection = () => {
    if (newConnection.name && newConnection.host) {
      const newConn: Connection = {
        id: Date.now().toString(),
        name: newConnection.name,
        host: newConnection.host,
        port: newConnection.port,
        database: newConnection.database,
        username: newConnection.username,
        active: false,
      };
      const updatedConnections = [...connections, newConn];
      setConnections(updatedConnections);
      onUpdateConnections(updatedConnections);
      setNewConnection({
        name: '',
        host: '',
        port: '',
        database: '',
        username: '',
        password: '',
      });
    }
  };

  const handleAddUser = () => {
    if (newUser.name && newUser.email) {
      const user: User = {
        id: Date.now().toString(),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: 'active',
      };
      setUsers([...users, user]);
      setNewUser({
        name: '',
        email: '',
        role: 'User',
      });
      setAddingUser(false);
    }
  };

  const handleUpdateUserRole = (userId: string, newRole: 'Admin' | 'User' | 'Moderator') => {
    setUsers(users.map(user => 
      user.id === userId ? { ...user, role: newRole } : user
    ));
  };

  const handleToggleUserStatus = (userId: string) => {
    setUsers(users.map(user => 
      user.id === userId 
        ? { ...user, status: user.status === 'active' ? 'suspended' : 'active' } 
        : user
    ));
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(users.filter(user => user.id !== userId));
    setManagingUser(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] sm:h-[85vh] flex flex-col w-[95vw] sm:w-full p-0">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
          <DialogHeader>
            <DialogTitle>Admin Panel</DialogTitle>
            <DialogDescription>
              Manage your Talk2Tables settings and database connections
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs value={defaultTab} onValueChange={onDefaultTabChange} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 sm:px-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2 h-auto p-1">
              <TabsTrigger value="general" className="text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-2 gap-1 sm:gap-2">
                <Shield className="h-4 w-4 sm:h-4 sm:w-4" />
                <span>General</span>
              </TabsTrigger>
              <TabsTrigger value="connections" className="text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-2 gap-1 sm:gap-2">
                <Database className="h-4 w-4 sm:h-4 sm:w-4" />
                <span>Connections</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-2 gap-1 sm:gap-2">
                <User className="h-4 w-4 sm:h-4 sm:w-4" />
                <span>Users</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-2 gap-1 sm:gap-2">
                <Bell className="h-4 w-4 sm:h-4 sm:w-4" />
                <span>Notifs</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow New Users</Label>
                  <p className="text-muted-foreground">
                    Allow new users to join the chat
                  </p>
                </div>
                <Switch
                  checked={adminSettings.allowNewUsers}
                  onCheckedChange={(checked: any) =>
                    setAdminSettings({ ...adminSettings, allowNewUsers: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Admin Approval</Label>
                  <p className="text-muted-foreground">
                    New users need admin approval before joining
                  </p>
                </div>
                <Switch
                  checked={adminSettings.requireApproval}
                  onCheckedChange={(checked: any) =>
                    setAdminSettings({ ...adminSettings, requireApproval: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Notifications</Label>
                  <p className="text-muted-foreground">
                    Receive notifications for new messages
                  </p>
                </div>
                <Switch
                  checked={adminSettings.enableNotifications}
                  onCheckedChange={(checked: any) =>
                    setAdminSettings({ ...adminSettings, enableNotifications: checked })
                  }
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="maxLength">Maximum Message Length</Label>
                <Input
                  id="maxLength"
                  type="number"
                  value={adminSettings.maxMessageLength}
                  onChange={(e) =>
                    setAdminSettings({ ...adminSettings, maxMessageLength: e.target.value })
                  }
                />
              </div>
            </div>
            </TabsContent>

            <TabsContent value="connections" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Manage Connection Strings</Label>
              <p className="text-muted-foreground">
                Add, edit, or remove database connection strings
              </p>
            </div>

            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex flex-col gap-2 p-4 border border-border rounded-lg"
                >
                  {editingConnection?.id === conn.id ? (
                    <div className="flex-1 space-y-2">
                      <Input 
                        value={editingConnection.name}
                        onChange={(e) => setEditingConnection({...editingConnection, name: e.target.value})}
                        placeholder="Connection Name"
                      />
                      <Input 
                        value={editingConnection.host}
                        onChange={(e) => setEditingConnection({...editingConnection, host: e.target.value})}
                        placeholder="Host"
                      />
                      <Input 
                        value={editingConnection.port || ''}
                        onChange={(e) => setEditingConnection({...editingConnection, port: e.target.value})}
                        placeholder="Port"
                      />
                      <Input 
                        value={editingConnection.database || ''}
                        onChange={(e) => setEditingConnection({...editingConnection, database: e.target.value})}
                        placeholder="Database"
                      />
                      <Input 
                        value={editingConnection.username || ''}
                        onChange={(e) => setEditingConnection({...editingConnection, username: e.target.value})}
                        placeholder="Username"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveConnection}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingConnection(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Database className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{conn.name}</span>
                              {conn.active && (
                                <Badge variant="default">Active</Badge>
                              )}
                            </div>
                            <div className="space-y-0.5 text-muted-foreground">
                              <p className="truncate">{conn.host}{conn.port ? `:${conn.port}` : ''}</p>
                              {conn.database && <p className="truncate">Database: {conn.database}</p>}
                              {conn.username && <p className="truncate">User: {conn.username}</p>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingConnection(conn)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setDeleteConnectionId(conn.id)}
                            disabled={conn.active}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Add New Connection String</Label>
              <div className="space-y-2">
                <Input 
                  placeholder="Connection Name" 
                  value={newConnection.name}
                  onChange={(e) => setNewConnection({...newConnection, name: e.target.value})}
                />
                <Input 
                  placeholder="Host (e.g., db.example.com)" 
                  value={newConnection.host}
                  onChange={(e) => setNewConnection({...newConnection, host: e.target.value})}
                />
                <Input 
                  placeholder="Port" 
                  type="number"
                  value={newConnection.port}
                  onChange={(e) => setNewConnection({...newConnection, port: e.target.value})}
                />
                <Input 
                  placeholder="Database Name"
                  value={newConnection.database}
                  onChange={(e) => setNewConnection({...newConnection, database: e.target.value})}
                />
                <Input 
                  placeholder="Username"
                  value={newConnection.username}
                  onChange={(e) => setNewConnection({...newConnection, username: e.target.value})}
                />
                <Input 
                  placeholder="Password" 
                  type="password"
                  value={newConnection.password}
                  onChange={(e) => setNewConnection({...newConnection, password: e.target.value})}
                />
                <Button 
                  className="w-full"
                  onClick={handleAddConnection}
                  disabled={!newConnection.name || !newConnection.host}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Add New Connection
                </Button>
              </div>
            </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>User Management</Label>
              <p className="text-muted-foreground">
                View and manage users in your chat interface
              </p>
            </div>

            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span>{user.name}</span>
                        <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                        {user.status === 'suspended' && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setManagingUser(user)}
                  >
                    <UserCog className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                </div>
              ))}
            </div>

            <Button 
              className="w-full"
              onClick={() => setAddingUser(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add New User
            </Button>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Desktop Notifications</Label>
                  <p className="text-muted-foreground">
                    Show desktop notifications for new messages
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Sound Alerts</Label>
                  <p className="text-muted-foreground">
                    Play sound when receiving messages
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-muted-foreground">
                    Receive email summaries of chat activity
                  </p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mention Alerts</Label>
                  <p className="text-muted-foreground">
                    Get notified when someone mentions you
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 px-4 sm:px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Save Changes
          </Button>
        </div>
      </DialogContent>

      {/* Delete Connection Confirmation */}
      <AlertDialog open={!!deleteConnectionId} onOpenChange={() => setDeleteConnectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this connection? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteConnectionId && (
            <div className="space-y-2 py-4">
              {(() => {
                const conn = connections.find(c => c.id === deleteConnectionId);
                if (!conn) return null;
                return (
                  <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span>{conn.name}</span>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong>Host:</strong> {conn.host}</p>
                      {conn.port && <p><strong>Port:</strong> {conn.port}</p>}
                      {conn.database && <p><strong>Database:</strong> {conn.database}</p>}
                      {conn.username && <p><strong>Username:</strong> {conn.username}</p>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteConnectionId && handleDeleteConnection(deleteConnectionId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage User Dialog */}
      <AlertDialog open={!!managingUser} onOpenChange={() => setManagingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manage User - {managingUser?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Update user role, status, or remove the user from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {managingUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>User Role</Label>
                <Select 
                  value={managingUser.role} 
                  onValueChange={(value: string) => handleUpdateUserRole(managingUser.id, value as 'Admin' | 'User' | 'Moderator')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Moderator">Moderator</SelectItem>
                    <SelectItem value="User">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Account Status</Label>
                  <p className="text-muted-foreground">
                    {managingUser.status === 'active' ? 'Account is active' : 'Account is suspended'}
                  </p>
                </div>
                <Button
                  variant={managingUser.status === 'active' ? 'outline' : 'default'}
                  onClick={() => handleToggleUserStatus(managingUser.id)}
                >
                  {managingUser.status === 'active' ? (
                    <>
                      <UserX className="h-4 w-4 mr-2" />
                      Suspend
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 mr-2" />
                      Activate
                    </>
                  )}
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-red-600">Danger Zone</Label>
                  <p className="text-muted-foreground">
                    Permanently delete this user
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteUser(managingUser.id)}
                  disabled={managingUser.role === 'Admin'}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </Button>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add New User Dialog */}
      <AlertDialog open={addingUser} onOpenChange={setAddingUser}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add New User</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the details for the new user account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                placeholder="John Doe"
                value={newUser.name}
                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                type="email"
                placeholder="john@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>User Role</Label>
              <Select 
                value={newUser.role} 
                onValueChange={(value: string) => setNewUser({...newUser, role: value as 'Admin' | 'User' | 'Moderator'})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">User</SelectItem>
                  <SelectItem value="Moderator">Moderator</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setNewUser({ name: '', email: '', role: 'User' });
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAddUser}
              disabled={!newUser.name || !newUser.email}
            >
              Add User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}