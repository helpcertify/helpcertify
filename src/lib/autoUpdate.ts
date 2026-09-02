// Keeps an already-open tab current with the latest deploy without the
// visitor pressing refresh. The client build stamps import.meta.env.
// VITE_BUILD_ID and emits /version.json holding the same id
// (buildVersionPlugin in vite.config.ts). We poll that file and, when the
// id no longer matches the one this tab booted with, reload once.
//
// Deliberately NOT a service worker: a precaching SW stranded visitors on a
// blank screen once and its registerSW loop hid fresh deploys for everyone
// (see vite.config.ts and public/sw.js). This is a plain fetch + a single
// guarded reload, so the worst case is one wasted reload, never a loop.

const BOOT_ID = import.meta.env.VITE_BUILD_ID;
const RELOADED_FOR_KEY = 'hc:autoUpdate:reloadedFor';
const MIN_GAP_MS = 15_000;
const POLL_MS = 5 * 60_000;

let lastCheck = 0;

function unsavedWorkInProgress(): boolean {
  // Set by long forms that would lose data on reload (e.g. the exam
  // preparation editor). Skip the auto-reload while one is dirty; the next
  // poll after they save or navigate away will pick the new version up.
  return !!(window as unknown as { __hcUnsaved?: boolean }).__hcUnsaved;
}

async function check(): Promise<void> {
  if (!BOOT_ID) return; // running a dev build - nothing to compare against
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const now = Date.now();
  if (now - lastCheck < MIN_GAP_MS) return;
  lastCheck = now;

  let serverId: string | undefined;
  try {
    const res = await fetch(`/version.json?t=${now}`, { cache: 'no-store' });
    if (!res.ok) return;
    serverId = ((await res.json()) as { v?: string }).v;
  } catch {
    return; // offline, blocked, or mid-deploy - try again next tick
  }

  if (!serverId || serverId === BOOT_ID) return;

  let reloadedFor: string | null = null;
  try {
    reloadedFor = sessionStorage.getItem(RELOADED_FOR_KEY);
  } catch {
    /* private mode / storage disabled - fall through, the id check still guards */
  }
  if (reloadedFor === serverId) return; // already reloaded once for this deploy - do not loop
  if (unsavedWorkInProgress()) return;

  try {
    sessionStorage.setItem(RELOADED_FOR_KEY, serverId);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function startAutoUpdate(): void {
  if (!BOOT_ID) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('focus', () => void check());
  window.addEventListener('online', () => void check());
  window.setInterval(() => void check(), POLL_MS);
  window.setTimeout(() => void check(), 20_000);
}
