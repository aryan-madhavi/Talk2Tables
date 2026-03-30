// src/app/pages/AdminPanel/components/AddConnectionDialog.tsx
import React, { useState } from 'react';
import {
  Database, X, Eye, EyeOff, Loader2, Wifi,
  Lock, Server, CheckCircle, XCircle, ChevronDown,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import {
  ConnectionForm,
  ConnectionFormErrors,
  DbType,
  TestStatus,
  DB_DEFAULTS,
  EMPTY_CONNECTION_FORM,
} from '../types';
import { Field }    from '../../../components/shared/Field';
import { inputCls } from '../../../components/shared/inputCls';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AddConnectionDialogProps {
  open:         boolean;
  onClose:      () => void;
  onSave:       (data: ConnectionForm) => void;
  initialData?: ConnectionForm;
  saving?:      boolean;
  /**
   * Called when user clicks "Test Connection".
   * Only available in edit mode (connection already exists).
   * Returns { ok, message } from the backend test endpoint.
   */
  onTest?:      () => Promise<{ ok: boolean; message: string }>;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function AddConnectionDialog({
  open,
  onClose,
  onSave,
  initialData,
  saving  = false,
  onTest,
}: AddConnectionDialogProps) {
  const isEditMode = !!initialData;

  const [form,         setForm]         = useState<ConnectionForm>(initialData ?? EMPTY_CONNECTION_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus,   setTestStatus]   = useState<TestStatus>('idle');
  const [testMessage,  setTestMessage]  = useState('');
  const [errors,       setErrors]       = useState<ConnectionFormErrors>({});

  if (!open) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const setField = (field: keyof ConnectionForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleTypeChange = (type: DbType) => {
    setForm(prev => ({
      ...prev,
      type,
      port: DB_DEFAULTS[type].port,
    }));
    // Clear test result when type changes
    setTestStatus('idle');
    setTestMessage('');
  };

  const validate = (): boolean => {
    const e: ConnectionFormErrors = {};
    if (!form.name.trim())     e.name     = 'Connection name is required';
    if (!form.database.trim()) e.database = 'Database name is required';
    if (!form.host.trim())     e.host     = 'Host is required';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!isEditMode && !form.password) e.password = 'Password is required';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!validate()) return;
    if (!onTest) return; // create mode — button should be hidden

    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await onTest();
      setTestStatus(result.ok ? 'success' : 'error');
      setTestMessage(result.message);
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed.');
    }
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
  };

  const dbTypes = Object.keys(DB_DEFAULTS) as DbType[];

  // ── Render ────────────────────────────────────────────────────────────────────

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
          className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100
                     animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {isEditMode ? 'Configure Connection' : 'Add Database Connection'}
                </h2>
                <p className="text-xs text-gray-500 font-normal mt-0.5">
                  {isEditMode ? `Editing — ${initialData?.name}` : 'Configure a new data source'}
                </p>
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

          {/* ── Body ── */}
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* DB Type Dropdown */}
            <Field
              label={
                <>
                  Database Type
                  {isEditMode && (
                    <span className="ml-2 normal-case font-normal text-gray-400">(cannot be changed)</span>
                  )}
                </>
              }
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none pointer-events-none">
                  {DB_DEFAULTS[form.type]?.icon}
                </span>
                <select
                  value={form.type}
                  onChange={e => !isEditMode && handleTypeChange(e.target.value as DbType)}
                  disabled={isEditMode}
                  className={cn(
                    inputCls(false),
                    'pl-9 pr-9 appearance-none',
                    isEditMode && 'opacity-60 cursor-not-allowed bg-gray-50',
                  )}
                >
                  {dbTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </Field>

            {/* Connection Name */}
            <Field label="Connection Name" error={errors.name} required>
              <input
                type="text"
                placeholder="e.g. Production DB"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                className={inputCls(!!errors.name)}
              />
            </Field>

            {/* Host & Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Host" error={errors.host} required>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="localhost or IP"
                      value={form.host}
                      onChange={e => setField('host', e.target.value)}
                      className={cn(inputCls(!!errors.host), 'pl-8')}
                    />
                  </div>
                </Field>
              </div>
              <Field label="Port">
                <input
                  type="text"
                  placeholder={DB_DEFAULTS[form.type]?.port ?? ''}
                  value={form.port}
                  onChange={e => setField('port', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
            </div>

            {/* Database Name */}
            <Field label="Database Name" error={errors.database} required>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="my_database"
                  value={form.database}
                  onChange={e => setField('database', e.target.value)}
                  className={cn(inputCls(!!errors.database), 'pl-8')}
                />
              </div>
            </Field>

            {/* Username & Password */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username" error={errors.username} required>
                <input
                  type="text"
                  placeholder="db_user"
                  value={form.username}
                  onChange={e => setField('username', e.target.value)}
                  className={inputCls(!!errors.username)}
                />
              </Field>
              <Field label={isEditMode ? 'New Password' : 'Password'} error={errors.password} required={!isEditMode}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isEditMode ? 'Leave blank to keep current' : '••••••••'}
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    className={cn(inputCls(!!errors.password), 'pl-8 pr-9')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </Field>
            </div>

            {/* SSL Toggle */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center',
                  form.ssl ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500',
                )}>
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">SSL / TLS Encryption</div>
                  <div className="text-xs text-gray-500">Encrypt the connection with SSL</div>
                </div>
              </div>
              <button
                onClick={() => setField('ssl', !form.ssl)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none',
                  form.ssl ? 'bg-blue-600' : 'bg-gray-300',
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200',
                  form.ssl ? 'translate-x-4.5' : 'translate-x-0.5',
                )} />
              </button>
            </div>

            {/* Test Status Banners */}
            {testStatus === 'success' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200
                              text-green-700 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {testMessage || 'Connection successful! Ready to save.'}
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200
                              text-red-700 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {testMessage || 'Connection failed. Check your credentials and try again.'}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100 gap-3">
            {/* Test Connection — only functional in edit mode */}
            {onTest ? (
              <button
                onClick={handleTest}
                disabled={testStatus === 'testing' || saving}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all',
                  testStatus === 'testing' || saving
                    ? 'border-gray-200 text-gray-400 bg-white cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100 hover:border-gray-400',
                )}
              >
                {testStatus === 'testing'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                  : <><Wifi    className="w-4 h-4" /> Test Connection</>}
              </button>
            ) : (
              <span className="text-xs text-gray-400 italic">
                Save first to test connection
              </span>
            )}

            {/* Cancel / Save */}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600
                           hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  'px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm',
                  saving
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95',
                )}
              >
                {saving
                  ? <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</span>
                  : isEditMode ? 'Save Changes' : 'Save Connection'
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
