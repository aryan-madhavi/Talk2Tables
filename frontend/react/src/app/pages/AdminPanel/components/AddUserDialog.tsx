// src/app/pages/AdminPanel/components/AddUserDialog.tsx
import React, { useState, useEffect } from 'react';
import { X, User, Mail, Lock, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { UserRole } from '../../../../lib/userService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AddUserForm {
  display_name: string;
  email:        string;
  password:     string;
  role:         UserRole;
}

interface Props {
  open:    boolean;
  onClose: () => void;
  onSave:  (data: AddUserForm) => void;
  saving?: boolean;
}

type FormErrors = Partial<Record<keyof AddUserForm, string>>;

// ── Role options ──────────────────────────────────────────────────────────────

const ROLES: {
  value:       UserRole;
  label:       string;
  description: string;
  active:      string;   // classes when selected
}[] = [
  { value: 'analyst',    label: 'Analyst',    description: 'SELECT queries on assigned DBs',            active: 'border-gray-400   bg-gray-50   text-gray-700'   },
  { value: 'power_user', label: 'Power User', description: 'SELECT + write queries on assigned DBs',    active: 'border-purple-500 bg-purple-50 text-purple-700' },
  { value: 'db_manager', label: 'DB Manager', description: 'Manage connections and access grants',      active: 'border-blue-500   bg-blue-50   text-blue-700'   },
  { value: 'admin',      label: 'Admin',      description: 'Full control — users, connections, grants', active: 'border-red-500    bg-red-50    text-red-700'    },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AddUserDialog({ open, onClose, onSave, saving = false }: Props) {
  const [form,    setForm]    = useState<AddUserForm>({ display_name: '', email: '', password: '', role: 'analyst' });
  const [errors,  setErrors]  = useState<FormErrors>({});
  const [showPwd, setShowPwd] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm({ display_name: '', email: '', password: '', role: 'analyst' });
      setErrors({});
      setShowPwd(false);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof AddUserForm, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: '' }));
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.email.trim())
      e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Enter a valid email address';
    if (!form.password)
      e.password = 'Password is required';
    else if (form.password.length < 8)
      e.password = 'Minimum 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const inputCls = (err?: string) => cn(
    'w-full border rounded-lg px-3 py-2 text-sm outline-none transition-all',
    err
      ? 'border-red-400 focus:ring-2 focus:ring-red-300'
      : 'border-gray-200 focus:ring-2 focus:ring-blue-500',
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl
                     border border-gray-100 animate-in fade-in zoom-in-95
                     slide-in-from-bottom-4 duration-300 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                <User className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Add New User</h2>
                <p className="text-xs text-gray-500 mt-0.5">Create account and assign a role</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                         hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={form.display_name}
                  onChange={e => set('display_name', e.target.value)}
                  className={cn(inputCls(), 'pl-8')}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={cn(inputCls(errors.email), 'pl-8')}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className={cn(inputCls(errors.password), 'pl-8 pr-9')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Role <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => set('role', r.value)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all',
                      form.role === r.value
                        ? `${r.active} shadow-sm`
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3 h-3" />
                      <span className="text-xs font-bold">{r.label}</span>
                    </div>
                    <span className="text-xs opacity-70 font-normal leading-tight">{r.description}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600
                         hover:bg-gray-200 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={() => validate() && onSave(form)}
              disabled={saving}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm',
                saving
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95',
              )}
            >
              {saving
                ? <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</span>
                : 'Create User'
              }
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
