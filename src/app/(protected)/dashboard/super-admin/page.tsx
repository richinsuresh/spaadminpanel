'use client';

import React, { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Building2, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Lock, 
  CheckCircle, 
  QrCode,
  Loader2,
  Store,
} from 'lucide-react';

/* ================= TYPES ================= */

type Outlet = {
  id: string;
  name: string;
  location: string;
  password?: string;
  qr_code_url?: string;
  min_treatment_amount: number;
  is_active: boolean;
};

type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'developer' | 'staff' | 'manager';
  is_active: boolean;
  password?: string;
};

/* ================= MAIN COMPONENT ================= */

export default function SuperAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<'outlets' | 'users'>('outlets');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  
  const [editingOutlet, setEditingOutlet] = useState<Partial<Outlet>>({});
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AppUser>>({});

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') { 
      setIsAuthenticated(true);
      setAuthError('');
      fetchData();
    } else {
      setAuthError('Invalid Admin Password');
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Fetch ALL outlets (active & sold)
    // Note: SELECT usually works with RLS public read policies, so we can keep this client-side
    const { data: outletsData } = await supabase
      .from('outlets')
      .select('*')
      .order('is_active', { ascending: false }) // Active first
      .order('name', { ascending: true });
    
    const { data: usersData } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (outletsData) setOutlets(outletsData);
    if (usersData) setUsers(usersData);
    setLoading(false);
  }, []);

  // --- HELPER: Call the Server API ---
  const callManagementApi = async (action: string, payload: any) => {
    const res = await fetch('/api/super-admin/manage-outlet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action,
            payload,
            adminPassword // Send password to authorize the server-side action
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Operation failed');
    return data;
  };

  // --- SAVE HANDLERS ---
  const handleSaveOutlet = async () => {
    try {
      setLoading(true);
      let qrUrl = editingOutlet.qr_code_url;

      // 1. Upload QR (This is fine client-side if Storage policies allow public insert)
      // If Storage policies block this too, we might need a separate API, but let's assume Storage is open for now.
      if (qrFile) {
        setUploadingQr(true);
        const fileExt = qrFile.name.split('.').pop();
        const fileName = `qr-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('qr-codes').upload(fileName, qrFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('qr-codes').getPublicUrl(fileName);
        qrUrl = urlData.publicUrl;
      }

      const payload = {
        id: editingOutlet.id, // Needed for updates
        name: editingOutlet.name,
        location: editingOutlet.location,
        password: editingOutlet.password,
        qr_code_url: qrUrl,
        min_treatment_amount: editingOutlet.min_treatment_amount || 1800,
        is_active: editingOutlet.is_active ?? true,
      };

      // 2. Call API instead of direct DB write
      if (modalMode === 'add') {
        await callManagementApi('create', payload);
      } else {
        await callManagementApi('update', payload);
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error saving outlet: ' + err.message);
    } finally {
      setLoading(false);
      setUploadingQr(false);
    }
  };

  const handleSaveUser = async () => {
    try {
        // Users table updates might also fail RLS, but let's stick to the requested fix first.
        // If this fails, we need to add 'manage-user' API logic too.
        setLoading(true);
        const payload: any = {
            username: editingUser.username,
            role: editingUser.role,
            is_active: editingUser.is_active ?? true,
        };
        if (editingUser.password) payload.password = editingUser.password;

        if (modalMode === 'add') {
            if (!editingUser.password) throw new Error("Password is required for new users");
            const { error } = await supabase.from('app_users').insert(payload);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('app_users').update(payload).eq('id', editingUser.id);
            if (error) throw error;
        }
        setIsModalOpen(false);
        fetchData();
    } catch (err: any) {
        alert('Error saving user (Check RLS or use API): ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  // --- ACTIONS (UPDATED TO USE API) ---

  // 1. Mark as Sold / Active
  const toggleOutletStatus = async (id: string, currentStatus: boolean) => {
    const action = currentStatus ? 'MARK AS SOLD' : 'RE-ACTIVATE';
    const message = currentStatus 
      ? "Marking as SOLD will disable logins for this outlet, but all Sales History will remain visible in reports. Proceed?" 
      : "Re-activating will allow logins and new sales again. Proceed?";
      
    if (!confirm(message)) return;
    
    try {
        await callManagementApi('toggle_status', { id, is_active: !currentStatus });
        fetchData();
    } catch (err: any) {
        alert('Failed to update status: ' + err.message);
    }
  };

  // 2. Delete Permanently
  const handleDeleteOutlet = async (id: string, name: string) => {
    const confirmMsg = `⚠️ DANGER: Are you sure you want to PERMANENTLY DELETE "${name}"?\n\nThis will fail if there are sales records linked to this outlet.\nClick OK to delete.`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
        await callManagementApi('delete', { id });
        fetchData();
    } catch (err: any) {
        alert('Failed to delete: ' + err.message + '\n(You likely have sales linked to this outlet. Use "Mark SOLD" instead.)');
    } finally {
        setLoading(false);
    }
  };

  // (User delete remains client-side for now, can be moved to API if needed)
  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}" permanently?`)) return;
    setLoading(true);
    const { error } = await supabase.from('app_users').delete().eq('id', id);
    setLoading(false);
    if (error) alert('Error: ' + error.message);
    else fetchData();
  };


  /* ================= RENDER ================= */
  // ... (Render logic remains exactly the same as previous step)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full border border-gray-700">
          <div className="flex justify-center mb-4 text-red-600"><Lock size={48} /></div>
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Super Admin Access</h1>
          <form onSubmit={handleLogin} className="space-y-4 mt-6">
            <input 
              type="password" placeholder="Master Password" 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 text-black"
              value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
            />
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
            <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg">
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Super Admin Settings</h1>
          <p className="text-gray-500">Manage outlets, QR codes, and user roles.</p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Lock Panel</button>
      </div>

      <div className="flex space-x-4 border-b border-gray-200">
        <button onClick={() => setActiveTab('outlets')} className={`pb-3 px-4 flex items-center gap-2 font-medium transition ${activeTab === 'outlets' ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-500'}`}>
          <Building2 size={18} /> Outlets Management
        </button>
        <button onClick={() => setActiveTab('users')} className={`pb-3 px-4 flex items-center gap-2 font-medium transition ${activeTab === 'users' ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-500'}`}>
          <Users size={18} /> User Profiles
        </button>
      </div>

      {activeTab === 'outlets' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-semibold text-gray-700">All Outlets ({outlets.length})</h3>
            <button 
              onClick={() => { setModalMode('add'); setEditingOutlet({ min_treatment_amount: 1800, is_active: true }); setQrFile(null); setIsModalOpen(true); }}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2"
            >
              <Plus size={16} /> Add New Outlet
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs">
                <tr>
                  <th className="px-6 py-3">Outlet Name</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Password</th>
                  <th className="px-6 py-3">QR Code</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outlets.map((outlet) => (
                  <tr key={outlet.id} className={!outlet.is_active ? 'bg-red-50/50' : ''}>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {outlet.name}
                    </td>
                    <td className="px-6 py-4">
                      {outlet.is_active ? (
                        <span className="flex items-center gap-1 text-green-600 font-bold text-xs bg-green-100 px-2 py-1 rounded-full w-fit">
                          <CheckCircle size={12} /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-700 font-bold text-xs bg-red-100 px-2 py-1 rounded-full w-fit">
                           <Store size={12} /> SOLD / CLOSED
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">{outlet.location || '—'}</td>
                    <td className="px-6 py-4 font-mono text-xs"><span className="bg-gray-100 px-2 py-1 rounded border">{outlet.password || '—'}</span></td>
                    <td className="px-6 py-4">
                      {outlet.qr_code_url ? <a href={outlet.qr_code_url} target="_blank" className="text-blue-600 hover:underline flex items-center gap-1"><QrCode size={14} /> View</a> : <span className="text-gray-400 italic">No QR</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* Edit */}
                        <button onClick={() => { setModalMode('edit'); setEditingOutlet(outlet); setQrFile(null); setIsModalOpen(true); }} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded border border-transparent hover:border-blue-200" title="Edit">
                          <Edit size={16} />
                        </button>
                        
                        {/* Toggle Sold/Active */}
                        <button 
                          onClick={() => toggleOutletStatus(outlet.id, outlet.is_active)}
                          className={`p-1.5 rounded transition flex items-center gap-1 text-xs font-bold border ${outlet.is_active ? 'border-orange-200 hover:bg-orange-50 text-orange-600' : 'border-green-200 hover:bg-green-50 text-green-600'}`}
                          title={outlet.is_active ? "Mark as Sold" : "Re-Activate"}
                        >
                          {outlet.is_active ? 'Mark SOLD' : 'Re-Open'}
                        </button>

                        {/* Delete */}
                        <button 
                          onClick={() => handleDeleteOutlet(outlet.id, outlet.name)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded border border-transparent hover:border-red-200"
                          title="Permanently Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USERS TAB CONTENT */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-semibold text-gray-700">System Users ({users.length})</h3>
            <button 
               onClick={() => { setModalMode('add'); setEditingUser({ role: 'staff', is_active: true }); setIsModalOpen(true); }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={16} /> Add User
            </button>
          </div>
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs">
              <tr>
                <th className="px-6 py-3">Username</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
               {users.map((u) => (
                 <tr key={u.id} className={!u.is_active ? 'opacity-60 bg-gray-50' : ''}>
                   <td className="px-6 py-4 font-medium text-gray-900">{u.username}</td>
                   <td className="px-6 py-4"><span className="px-2 py-1 rounded text-xs font-bold uppercase bg-gray-100">{u.role}</span></td>
                   <td className="px-6 py-4">{u.is_active ? 'Active' : 'Inactive'}</td>
                   <td className="px-6 py-4 text-right">
                     <div className="flex justify-end gap-2">
                         <button onClick={() => { setModalMode('edit'); setEditingUser(u); setIsModalOpen(true); }} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded"><Edit size={16} /></button>
                         <button onClick={() => handleDeleteUser(u.id, u.username)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 size={16} /></button>
                     </div>
                   </td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL (Add/Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
             <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{modalMode === 'add' ? 'Create New' : 'Edit Details'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
               {activeTab === 'outlets' ? (
                 <>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Outlet Name *</label>
                        <input type="text" className="w-full p-2 border rounded text-black" value={editingOutlet.name || ''} onChange={e => setEditingOutlet({...editingOutlet, name: e.target.value})} placeholder="e.g. Indiranagar" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Location</label>
                        <input type="text" className="w-full p-2 border rounded text-black" value={editingOutlet.location || ''} onChange={e => setEditingOutlet({...editingOutlet, location: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Password *</label>
                            <input type="text" className="w-full p-2 border rounded text-black font-mono" value={editingOutlet.password || ''} onChange={e => setEditingOutlet({...editingOutlet, password: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Min ₹</label>
                            <input type="number" className="w-full p-2 border rounded text-black" value={editingOutlet.min_treatment_amount || 1800} onChange={e => setEditingOutlet({...editingOutlet, min_treatment_amount: Number(e.target.value)})} />
                        </div>
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center cursor-pointer">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Update QR Code</label>
                        <input type="file" onChange={(e) => setQrFile(e.target.files?.[0] || null)} className="text-sm text-gray-500" />
                        {editingOutlet.qr_code_url && !qrFile && <p className="text-xs text-green-600 mt-1">Current QR Active</p>}
                    </div>
                 </>
               ) : (
                  <>
                    <input type="text" placeholder="Username" className="w-full p-2 border rounded text-black" value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} />
                    <input type="text" placeholder="Password (Optional for Edit)" className="w-full p-2 border rounded text-black" value={editingUser.password || ''} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                    <select className="w-full p-2 border rounded text-black" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as any})} >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                        <option value="manager">Manager</option>
                    </select>
                  </>
               )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded text-black">Cancel</button>
                <button onClick={activeTab === 'outlets' ? handleSaveOutlet : handleSaveUser} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded flex items-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}