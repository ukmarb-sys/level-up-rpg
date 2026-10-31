import { useEffect, useState } from 'react';
import { BUILD_ID, fetchDeployedBuild, isStaleBuild } from '../core/version';

/**
 * Checks the deployed version.json on start and whenever the app returns to the foreground,
 * and offers a reload when a newer build (e.g. new artwork) has been deployed.
 */
export function useStaleBuild(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let alive = true;
    const check = () =>
      fetchDeployedBuild(import.meta.env.BASE_URL).then((deployed) => {
        if (alive && isStaleBuild(BUILD_ID, deployed)) setStale(true);
      });
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return stale;
}

export function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="update-banner" role="alert">
      <span>A new version of the realm is available.</span>
      <button className="update-banner__btn" onClick={onReload}>
        Reload
      </button>
    </div>
  );
}
