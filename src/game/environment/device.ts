/** Reads the browser/device signals that pick the environment quality tier. */
import { qualityFor, type Quality } from './layout';

export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  const q = qualityFor({
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  // ?quality=low|high overrides detection (handy for checking a phone's other tier)
  if (forced === 'low' || forced === 'high') {
    const other = qualityFor({ cores: forced === 'low' ? 2 : 16, reducedMotion: !q.animate });
    return other;
  }
  return q;
}
