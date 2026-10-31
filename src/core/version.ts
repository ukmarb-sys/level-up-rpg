/**
 * Detects a stale page: GitHub Pages caches index.html (about 10 minutes), and home-screen web
 * apps can keep a page alive much longer, so after a deploy a player may still run the previous
 * build. The running build compares itself with the deployed version.json.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** True when a different build is deployed than the one running. */
export function isStaleBuild(running: string, deployed: unknown): boolean {
  if (running === 'dev' || typeof deployed !== 'string' || deployed.length === 0) return false;
  return deployed !== running;
}

/** Fetches the deployed build id, bypassing every cache. Resolves to null when unavailable. */
export async function fetchDeployedBuild(baseUrl: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`${baseUrl}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown };
    return typeof body.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}
