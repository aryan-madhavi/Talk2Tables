// src/app/pages/AdminPanel/components/DocsPanel.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Upload, X, Loader2, Trash2, CheckCircle,
  AlertCircle, FileUp, File, FileSpreadsheet, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import {
  uploadDoc,
  listDocs,
  deleteDoc,
  downloadDoc,
  DocMetadata,
} from '../../../../lib/connectionService';

// ── File type icon helper ─────────────────────────────────────────────────────

const FILE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  pdf:  { icon: FileText,        color: 'text-red-500 bg-red-50' },
  docx: { icon: FileText,        color: 'text-blue-500 bg-blue-50' },
  txt:  { icon: File,            color: 'text-gray-500 bg-gray-50' },
  md:   { icon: File,            color: 'text-purple-500 bg-purple-50' },
  csv:  { icon: FileSpreadsheet, color: 'text-green-500 bg-green-50' },
  xlsx: { icon: FileSpreadsheet, color: 'text-emerald-500 bg-emerald-50' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DocsPanelProps {
  open:         boolean;
  onClose:      () => void;
  connectionId: string;
  connectionName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocsPanel({ open, onClose, connectionId, connectionName }: DocsPanelProps) {
  const [docs, setDocs]               = useState<DocMetadata[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (docId: string) => {
    setExpandedDocs(prev => ({ ...prev, [docId]: !prev[docId] }));
  };

  // ── Fetch docs on mount ─────────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDocs(connectionId);
      setDocs(res.docs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load docs.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (open) fetchDocs();
  }, [open, fetchDocs]);

  // ── Upload handler ──────────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    // Validate
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const allowed = ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'];
    if (!allowed.includes(ext)) {
      toast.error(`Unsupported file type ".${ext}". Allowed: ${allowed.join(', ')}`);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(`File too large (${formatBytes(file.size)}). Maximum: 100 MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress('Uploading...');
    try {
      setUploadProgress('Processing with AI...');
      const result = await uploadDoc(connectionId, file);
      toast.success(
        result.table_count > 0
          ? `"${file.name}" uploaded — matched ${result.table_count} table${result.table_count !== 1 ? 's' : ''}`
          : `"${file.name}" uploaded — will be processed on next schema refresh`,
      );
      await fetchDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      toast.error(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // ── Delete handler ──────────────────────────────────────────────────────────

  const handleDelete = async (doc: DocMetadata) => {
    setDeletingId(doc.doc_id);
    try {
      await deleteDoc(connectionId, doc.doc_id);
      toast.success(`"${doc.filename}" deleted.`);
      setDocs(prev => prev.filter(d => d.doc_id !== doc.doc_id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed.';
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  if (!open) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel — slide in from right */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-gray-100
                   animate-in slide-in-from-right duration-300 flex flex-col"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Business Docs</h2>
              <p className="text-xs text-gray-500 font-normal mt-0.5 truncate max-w-[220px]">
                {connectionName}
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={cn(
              'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
              uploading && 'pointer-events-none opacity-60',
              dragOver
                ? 'border-violet-400 bg-violet-50'
                : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/50',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <p className="text-sm font-medium text-violet-700">
                  {uploadProgress || 'Processing...'}
                </p>
                <p className="text-xs text-gray-400">This may take a few seconds</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                  <FileUp className="w-6 h-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    Drop file here or <span className="text-violet-600">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    PDF, DOCX, TXT, MD, CSV, XLSX — up to 100 MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50/70 border border-blue-100">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Upload data dictionaries, business rules, or table documentation.
              AI will extract per-table context to improve query understanding.
            </p>
          </div>

          {/* ── Document list ── */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="p-4 rounded-xl border border-gray-100 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100" />
                    <div className="flex-1">
                      <div className="h-4 w-32 rounded bg-gray-100 mb-2" />
                      <div className="h-3 w-20 rounded bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">No documents uploaded</p>
              <p className="text-xs text-gray-400 mt-1">
                Upload your first business doc to enhance AI accuracy
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {docs.length} Document{docs.length !== 1 ? 's' : ''}
              </p>
              {docs.map(doc => {
                const { icon: Icon, color } = FILE_ICONS[doc.file_type] ?? FILE_ICONS.txt;
                const isDeleting = deletingId === doc.doc_id;

                return (
                  <div
                    key={doc.doc_id}
                    className={cn(
                      'group p-4 rounded-xl border border-gray-100 hover:border-gray-200',
                      'hover:shadow-sm transition-all bg-white',
                      isDeleting && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* File icon */}
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{formatBytes(doc.file_size_bytes)}</span>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-400">{formatDate(doc.uploaded_at)}</span>
                        </div>

                        {/* Tables matched */}
                        {doc.table_count > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-xs font-medium text-green-700">
                              {doc.table_count} table{doc.table_count !== 1 ? 's' : ''} enriched
                            </span>
                          </div>
                        )}
                        {doc.table_count === 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-amber-600">
                              Pending — refresh schema to process
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 items-end ml-2">
                        <button
                          onClick={async () => {
                            try {
                              await downloadDoc(connectionId, doc.doc_id);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Download failed.');
                            }
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all text-blue-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100"
                          title="Download document"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={isDeleting}
                          title="Delete document"
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
                            'text-gray-300 hover:text-red-500 hover:bg-red-50',
                            'opacity-0 group-hover:opacity-100',
                            isDeleting && 'opacity-100 cursor-not-allowed',
                          )}
                        >
                          {isDeleting
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Matched tables pills */}
                    {doc.tables_matched.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pl-[52px]">
                        {(expandedDocs[doc.doc_id] ? doc.tables_matched : doc.tables_matched.slice(0, 6)).map(t => (
                          <span
                            key={t}
                            className="px-2 py-0.5 text-[10px] font-medium rounded-full
                                       bg-violet-50 text-violet-600 border border-violet-100"
                          >
                            {t}
                          </span>
                        ))}
                        {doc.tables_matched.length > 6 && (
                          <button
                            onClick={() => toggleExpand(doc.doc_id)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded-full
                                      bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 
                                      border border-gray-200 transition-colors cursor-pointer"
                          >
                            {expandedDocs[doc.doc_id] ? 'Show less' : `+${doc.tables_matched.length - 6} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
