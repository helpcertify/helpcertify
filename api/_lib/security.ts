// TEMPORARY — bundler feasibility probe only, not part of the real feature
// yet. Confirms whether Vercel's per-function bundler can actually include a
// local shared module across api/*.ts files, since the existing
// no-shared-code-across-api-files convention was learned from three failed
// live deploys on an earlier feature and is worth re-testing before
// deciding whether the device/session security pipeline gets one shared
// module or nine hand-duplicated copies. Removed once the answer is known
// either way.
export function bundlerProbeMarker(): string {
  return 'shared-module-import-worked';
}
