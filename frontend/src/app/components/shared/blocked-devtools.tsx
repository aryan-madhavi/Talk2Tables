import { useEffect } from 'react';
import { toast } from 'sonner';

export function useDevToolsBlockedToast() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.electronAPI?.onDevToolsBlocked) return;
    window.electronAPI.onDevToolsBlocked(() => {
      toast.error('Developer tools are disabled!');
    });
  }, []);
}