import React, { useState } from 'react';
import { Download, Copy, Heart, Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { QueryResult } from '../types';

interface ResultActionBarProps {
  result:      QueryResult;
  onDownload:  () => void;
  onCopy:      (text: string) => void;
  onSave:      () => Promise<void>;
  isFavourited: boolean;
}

export function ResultActionBar({ result, onDownload, onCopy, onSave, isFavourited }: ResultActionBarProps) {
  const [saving,     setSaving]     = useState(false);
  const [justSaved,  setJustSaved]  = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
      if (!isFavourited) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
      <div className="flex gap-2">
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600
                     transition-all active:scale-95 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button
          onClick={() => onCopy(JSON.stringify(result.data, null, 2))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600
                     transition-all active:scale-95 shadow-sm"
        >
          <Copy className="w-3.5 h-3.5" /> Copy JSON
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        title={isFavourited ? 'Remove from saved' : 'Save this query'}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all active:scale-95',
          isFavourited
            ? 'bg-pink-50 border-pink-200 text-pink-600 hover:bg-pink-100'
            : 'bg-white border-gray-200 text-gray-500 hover:bg-pink-50 hover:text-pink-500 hover:border-pink-200',
        )}
      >
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Heart className={cn('w-3.5 h-3.5 transition-all', isFavourited && 'fill-pink-500')} />
        }
        {justSaved ? 'Saved!' : isFavourited ? 'Saved' : 'Save'}
      </button>
    </div>
  );
}
