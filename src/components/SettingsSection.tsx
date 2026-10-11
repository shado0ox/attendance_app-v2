import { useState } from 'react';
export default function SettingsSection({ title, open, onChange, children }: { title: string; open: boolean; onChange: (open: boolean) => void; children?: any }) {
  const [visited, setVisited] = useState(open);
  return <details className="border border-slate-200 bg-white rounded-2xl settings-section" open={open} onToggle={e => { const next = e.currentTarget.open; if (next) setVisited(true); if (next !== open) onChange(next); }}>
    <summary className="cursor-pointer p-4 min-h-12 font-bold text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-600">{title}<span className="float-left text-sm font-normal text-teal-700">{open ? 'طي' : 'توسيع'}</span></summary>
    {(open || visited) && <div className="border-t p-2 sm:p-3">{children}</div>}
  </details>;
}
