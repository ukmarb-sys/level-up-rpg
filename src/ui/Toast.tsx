import { useEffect, useState } from 'react';
import type { Snapshot } from '../core/store';

export function Toast({ toast }: { toast: Snapshot['toast'] }) {
  const [visible, setVisible] = useState<Snapshot['toast']>(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const t = setTimeout(() => setVisible(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!visible) return null;
  return (
    <div key={visible.id} className={`toast toast--${visible.tone}`} role="status" aria-live="polite">
      {visible.text}
    </div>
  );
}
