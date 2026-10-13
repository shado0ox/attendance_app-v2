import { useEffect, useRef, useState } from 'react';
import { emptyAppStoreLinks, installPlatform, parseAppStoreLinks } from '../lib/appInstallation';
export function useAppInstallation() {
  const [platform] = useState(() => installPlatform(navigator.userAgent, navigator.maxTouchPoints));
  const standalone = () => !!(navigator as any).standalone || ['standalone', 'fullscreen', 'minimal-ui'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches);
  const [installed, setInstalled] = useState(standalone), [canPrompt, setCanPrompt] = useState(false), [links, setLinks] = useState(emptyAppStoreLinks), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const promptRef = useRef<any>(null);
  useEffect(() => {
    const beforeInstall = (event: any) => { event.preventDefault(); promptRef.current = event; setCanPrompt(true); };
    const installedEvent = () => { promptRef.current = null; setCanPrompt(false); setInstalled(true); };
    const media = ['standalone', 'fullscreen', 'minimal-ui'].map(mode => window.matchMedia(`(display-mode: ${mode})`));
    const changed = () => setInstalled(standalone());
    window.addEventListener('beforeinstallprompt', beforeInstall); window.addEventListener('appinstalled', installedEvent);
    media.forEach(query => query.addEventListener('change', changed));
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installedEvent); media.forEach(query => query.removeEventListener('change', changed)); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => { try { const response = await fetch('/api/app-installation', { signal: controller.signal }); if (!response.ok) return; const data = parseAppStoreLinks(await response.json()); if (!controller.signal.aborted) setLinks(data); } catch { /* Manual guidance remains usable when configuration is unavailable. */ } };
    void load(); window.addEventListener('app-installation-updated', load);
    return () => { controller.abort(); window.removeEventListener('app-installation-updated', load); };
  }, []);
  const install = async () => {
    if (!promptRef.current || busy) return;
    const prompt = promptRef.current; promptRef.current = null; setCanPrompt(false); setBusy(true); setMessage('');
    try { await prompt.prompt(); const choice = await prompt.userChoice; setMessage(choice.outcome === 'accepted' ? 'تابع التثبيت من المتصفح، ثم افتح وفر دوام من الأيقونة.' : 'يمكنك التثبيت لاحقًا من قائمة المتصفح.'); }
    catch { setMessage('تعذر فتح نافذة التثبيت؛ اتبع الخطوات الموضحة أدناه.'); }
    finally { setBusy(false); }
  };
  return { platform, installed, canPrompt, links, busy, message, install };
}
