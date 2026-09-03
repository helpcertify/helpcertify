import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const REF_TOKEN_KEY = 'hc:ref';

// Mounted on the landing + register pages. If the URL carries ?ref=<code>,
// resolve it server-side and keep the opaque signed token in sessionStorage.
// Phase 2's checkout will forward it to freeze attribution onto the order.
// A bad / inactive / unknown code silently does nothing (never blocks the
// visitor). Runs once per code value.
export function useCaptureReferral(): void {
  const [params] = useSearchParams();
  const ref = params.get('ref');

  useEffect(() => {
    if (!ref) return;
    const code = ref.trim().toUpperCase();
    // Only partner codes (HCP + 6) go down this path; a learner Refer & Earn
    // code stays with RegisterPage's own referralCode handling.
    if (!/^HCP[A-Z2-9]{6}$/.test(code)) return;
    let cancelled = false;

    // Dynamic import so the landing page's build-time prerender module graph
    // (scripts/prerender.mjs) never pulls in vercelApi -> firebase.
    import('../api/partnerApi')
      .then(({ partnerApi }) =>
        partnerApi.resolveReferral({ code, productId: 'HELPCERTIFY', landingPath: window.location.pathname }),
      )
      .then((res) => {
        if (cancelled) return;
        try {
          if (res.valid && res.token) sessionStorage.setItem(REF_TOKEN_KEY, res.token);
        } catch {
          /* private mode / storage blocked - non-fatal */
        }
      })
      .catch(() => {
        /* resolution failure must never surface to the visitor */
      });

    return () => {
      cancelled = true;
    };
  }, [ref]);
}
