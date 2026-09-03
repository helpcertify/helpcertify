import type { VercelRequest, VercelResponse } from '@vercel/node';

// Partner Commission Framework - Phase 1 handler. This stub exists first to
// confirm the Vercel deployment accepts a 13th api/*.ts file (a 13th once
// failed to deploy on the pre-Fluid-Compute Hobby plan - see the
// vercel-hobby-function-cap memory). The real actions land in the next
// commit. Self-contained, like every other api/*.ts file in this repo.
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({ ok: true, phase: 'partner-framework-1', ready: false });
}
