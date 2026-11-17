'use client';
import { useCallback } from 'react';
import { useToast } from '@/lib/state/ToastProvider';

export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, label = 'Copied to clipboard') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(label, 'success');
      } catch {
        // Clipboard API can be blocked (insecure origin, permissions). Fall back to a selection copy.
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          toast(ok ? label : 'Could not copy. Select the text and copy it manually.', ok ? 'success' : 'error');
        } catch {
          toast('Could not copy. Select the text and copy it manually.', 'error');
        }
      }
    },
    [toast],
  );
}
