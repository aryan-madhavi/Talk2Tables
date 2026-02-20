import React, { useState } from 'react';
import { 
  Users, Activity, Database, BarChart2, Shield, AlertTriangle, 
  MoreVertical, CheckCircle, XCircle, Search, UserPlus 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { databases, auditLogs, currentUser } from '../data/mockData';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ComingSoon } from '../routes';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'databases' | 'stats'>('users');

  const chartData = [
    { name: 'Mon', queries: 400, errors: 24 },
    { name: 'Tue', queries: 300, errors: 13 },
    { name: 'Wed', queries: 550, errors: 38 },
    { name: 'Thu', queries: 450, errors: 20 },
    { name: 'Fri', queries: 600, errors: 45 },
    { name: 'Sat', queries: 200, errors: 10 },
    { name: 'Sun', queries: 150, errors: 5 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-700" />
            Admin Panel
          </h1>
          <p className="text-gray-500">Manage users, connections, and system health</p>
        </div>
        <div className="flex gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          {[
            { id: 'users', label: 'Users', icon: Users },
            { id: 'audit', label: 'Audit Logs', icon: Activity },
            { id: 'databases', label: 'Connections', icon: Database },
            { id: 'stats', label: 'Usage Stats', icon: BarChart2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px] overflow-hidden">
        {activeTab === 'users' && (
          <div className="p-6 animate-in fade-in">
             <div className="flex justify-between items-center mb-6">
                <div className="relative w-64">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                   <input type="text" placeholder="Search users..." className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <UserPlus className="w-4 h-4" /> Add User
                </button>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                   <tr>
                     <th className="px-6 py-3 font-medium rounded-tl-lg">User</th>
                     <th className="px-6 py-3 font-medium">Role</th>
                     <th className="px-6 py-3 font-medium">Status</th>
                     <th className="px-6 py-3 font-medium">Last Active</th>
                     <th className="px-6 py-3 font-medium rounded-tr-lg"></th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {[1, 2, 3].map((i) => (
                     <tr key={i} className="hover:bg-gray-50 transition-colors">
                       <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                           {i === 1 ? 'SG' : i === 2 ? 'AM' : 'SD'}
                         </div>
                         <div>
                           <div className="font-bold">{i === 1 ? 'Sahil Gangani' : i === 2 ? 'Aryan Madhavi' : 'Sankalp Dawada'}</div>
                           <div className="text-xs text-gray-500 font-normal">user{i}@email.com</div>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-gray-600">
                         <span className={cn(
                           "px-2 py-1 rounded-full text-xs font-medium border",
                           i === 1 ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-gray-50 text-gray-700 border-gray-100"
                         )}>
                           {i === 1 ? 'Admin' : 'User'}
                         </span>
                       </td>
                       <td className="px-6 py-4">
                         <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                           <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                           Active
                         </span>
                       </td>
                       <td className="px-6 py-4 text-gray-500 text-xs">
                         2 mins ago
                       </td>
                       <td className="px-6 py-4 text-right">
                         <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                           <MoreVertical className="w-4 h-4" />
                         </button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <ComingSoon />
          /* <div className="p-6 animate-in fade-in">
             <h3 className="text-lg font-bold text-gray-900 mb-6">System Audit Log</h3>
             <div className="space-y-4">
               {auditLogs.map((log) => (
                 <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100 hover:shadow-sm transition-shadow">
                   <div className={cn(
                     "mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                     log.severity === 'info' ? "bg-blue-50 border-blue-100 text-blue-600" :
                     log.severity === 'warning' ? "bg-amber-50 border-amber-100 text-amber-600" :
                     "bg-red-50 border-red-100 text-red-600"
                   )}>
                     {log.severity === 'info' ? <CheckCircle className="w-4 h-4" /> : 
                      log.severity === 'warning' ? <AlertTriangle className="w-4 h-4" /> :
                      <XCircle className="w-4 h-4" />}
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center justify-between mb-1">
                       <h4 className="font-bold text-gray-900 text-sm">{log.action}</h4>
                       <span className="text-xs text-gray-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                     </div>
                     <p className="text-sm text-gray-600">{log.details}</p>
                     <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                       <span className="font-medium text-gray-500">{log.user}</span>
                       <span>•</span>
                       <span className="uppercase tracking-wider">{log.severity}</span>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          </div> */
        )}

        {activeTab === 'databases' && (
          <div className="p-6 animate-in fade-in">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">Database Connections</h3>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <UserPlus className="w-4 h-4" /> Add Connection
                </button>
             </div>
             <div className="grid md:grid-cols-2 gap-6">
               {databases.map((db) => (
                 <div key={db.id} className="p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group bg-white">
                   <div className="flex items-start justify-between mb-4">
                     <div className="p-3 bg-blue-50 text-blue-700 rounded-lg group-hover:bg-blue-100 transition-colors">
                       <Database className="w-6 h-6" />
                     </div>
                     <span className={cn(
                       "px-2 py-1 text-xs font-bold rounded-full border uppercase tracking-wide",
                       db.status === 'active' ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-50 text-gray-600 border-gray-100"
                     )}>
                       {db.status}
                     </span>
                   </div>
                   <h4 className="font-bold text-gray-900 text-lg mb-1">{db.name}</h4>
                   <p className="text-sm text-gray-500 mb-4 font-mono">{db.host}</p>
                   <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                     <span className="text-xs text-gray-400 font-medium">{db.type}</span>
                     <button className="text-sm font-medium text-blue-700 hover:underline">Configure</button>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <ComingSoon />
           /* <div className="p-6 animate-in fade-in h-full flex flex-col">
             <h3 className="text-lg font-bold text-gray-900 mb-6">System Usage Statistics</h3>
             <div className="h-[400px] w-full flex items-center justify-center">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                   <defs>
                     <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#0D47A1" stopOpacity={0.8}/>
                       <stop offset="95%" stopColor="#0D47A1" stopOpacity={0}/>
                     </linearGradient>
                     <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#C62828" stopOpacity={0.8}/>
                       <stop offset="95%" stopColor="#C62828" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <XAxis dataKey="name" />
                   <YAxis />
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <Tooltip />
                   <Area type="monotone" dataKey="queries" stroke="#0D47A1" fillOpacity={1} fill="url(#colorQueries)" />
                   <Area type="monotone" dataKey="errors" stroke="#C62828" fillOpacity={1} fill="url(#colorErrors)" />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           </div> */
        )}
      </div>
    </div>
  );
}