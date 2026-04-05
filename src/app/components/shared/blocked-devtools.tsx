import { useEffect } from 'react';
import { toast } from 'sonner';

export function useDevToolsBlockedToast() {
  useEffect(() => {
    console.log('hook mounted');
    console.log('electronAPI:', window.electronAPI);
    console.log('onDevToolsBlocked:', window.electronAPI?.onDevToolsBlocked);
    window.electronAPI.onDevToolsBlocked(() => {
      toast.error('Developer tools are disabled!');
    });
  }, []);
}