import React, { useRef, useState } from 'react';
import {
  Database, X, Eye, EyeOff, Loader2, Wifi,
  Lock, Server, CheckCircle, XCircle,
  Upload, FileText, FolderOpen, Trash2,
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
import { Field } from '../../../components/shared/Field';
import { inputCls } from '../../../components/shared/inputCls';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AddConnectionDialogProps {
  open:         boolean;
  onClose:      () => void;
  onSave:       (data: ConnectionForm) => void;
  /** Pass an existing connection to open in edit/configure mode */
  initialData?: ConnectionForm;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function AddConnectionDialog({ open, onClose, onSave, initialData }: AddConnectionDialogProps) {
  const isEditMode = !!initialData;

  const [form, setForm]                 = useState<ConnectionForm>(initialData ?? EMPTY_CONNECTION_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus]     = useState<TestStatus>('idle');
  const [errors, setErrors]             = useState<ConnectionFormErrors>({});
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // ── Reset / pre-fill state whenever dialog opens or initialData changes ───────

  React.useEffect(() => {
    if (open) {
      setForm(initialData ?? EMPTY_CONNECTION_FORM);
      setErrors({});
      setTestStatus('idle');
      setShowPassword(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, initialData]);

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
      port:       DB_DEFAULTS[type].port,
      sqliteFile: null,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setForm(prev => ({ ...prev, sqliteFile: file, database: file.name }));
    if (errors.database) setErrors(prev => ({ ...prev, database: '' }));
  };

  const handleRemoveFile = () => {
    setForm(prev => ({ ...prev, sqliteFile: null, database: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validate = (): boolean => {
    const e: ConnectionFormErrors = {};
    if (!form.name.trim()) e.name = 'Connection name is required';

    if (form.type === 'SQLite') {
      if (!form.sqliteFile) e.database = 'Please upload a .db file';
    } else {
      if (!form.database.trim()) e.database  = 'Database name is required';
      if (!form.host.trim())     e.host      = 'Host is required';
      if (!form.username.trim()) e.username  = 'Username is required';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleTest = () => {
    if (!validate()) return;
    setTestStatus('testing');
    // TODO: replace setTimeout with real API call
    setTimeout(() => {
      setTestStatus(Math.random() > 0.3 ? 'success' : 'error');
    }, 1800);
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
    setForm(EMPTY_CONNECTION_FORM);
    setTestStatus('idle');
    onClose();
  };

  const isSQLite = form.type === 'SQLite';

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
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                         hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* DB Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Database Type
                {isEditMode && (
                  <span className="ml-2 normal-case font-normal text-gray-400">(cannot be changed)</span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(DB_DEFAULTS) as DbType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => !isEditMode && handleTypeChange(type)}
                    disabled={isEditMode}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all',
                      form.type === type
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600',
                      isEditMode
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <span className="text-lg leading-none">{DB_DEFAULTS[type].icon}</span>
                    <span>{type}</span>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Host & Port — hidden for SQLite */}
            {!isSQLite && (
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
                    placeholder={DB_DEFAULTS[form.type].port}
                    value={form.port}
                    onChange={e => setField('port', e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
              </div>
            )}

            {/* ── SQLite: Upload only ── */}
            {isSQLite && (
              <Field label="Upload .db File" error={errors.database} required>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {!form.sqliteFile ? (
                  /* Drop zone */
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'w-full flex flex-col items-center justify-center gap-2 py-6 px-4',
                      'rounded-xl border-2 border-dashed transition-all',
                      errors.database
                        ? 'border-red-300 bg-red-50 hover:border-red-400'
                        : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40',
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      errors.database
                        ? 'bg-red-100 text-red-500'
                        : 'bg-white text-blue-600 shadow-sm border border-gray-200',
                    )}>
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-700">Click to upload</p>
                      <p className="text-xs text-gray-400 mt-0.5">.db · .sqlite · .sqlite3</p>
                    </div>
                  </button>
                ) : (
                  /* File selected — preview row */
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="w-9 h-9 rounded-lg bg-white border border-blue-200 shadow-sm
                                    flex items-center justify-center text-blue-600 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{form.sqliteFile.name}</p>
                      <p className="text-xs text-gray-500">{(form.sqliteFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                        title="Replace file"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleRemoveFile}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </Field>
            )}

            {/* Database Name — non-SQLite only */}
            {!isSQLite && (
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
            )}

            {/* Username & Password — hidden for SQLite */}
            {!isSQLite && (
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
                <Field label="Password">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      className={cn(inputCls(false), 'pl-8 pr-9')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword
                        ? <EyeOff className="w-3.5 h-3.5" />
                        : <Eye   className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            {/* SSL Toggle — hidden for SQLite */}
            {!isSQLite && (
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
            )}

            {/* Test Status Banners */}
            {testStatus === 'success' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200
                              text-green-700 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Connection successful! Ready to save.
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200
                              text-red-700 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <XCircle className="w-4 h-4 shrink-0" />
                Connection failed. Check your credentials and try again.
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100 gap-3">
            {/* Test Connection */}
            <button
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all',
                testStatus === 'testing'
                  ? 'border-gray-200 text-gray-400 bg-white cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100 hover:border-gray-400',
              )}
            >
              {testStatus === 'testing'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                : <><Wifi    className="w-4 h-4" /> Test Connection</>}
            </button>

            {/* Cancel / Save */}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white
                           hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              >
                {isEditMode ? 'Save Changes' : 'Save Connection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}