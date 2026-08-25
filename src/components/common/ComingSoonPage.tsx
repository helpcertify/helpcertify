// Temporary placeholder for routes not yet built out — replaced page by
// page through the build phases in the rebuild plan. Having every route
// resolve to something (rather than 404ing) lets the shell/theme/nav be
// verified end-to-end before every feature exists.
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-faint">This screen is being built next.</p>
    </div>
  );
}
