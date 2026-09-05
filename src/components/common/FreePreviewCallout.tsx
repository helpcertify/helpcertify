// Shown on the quiz / practice-test detail pages next to the free-preview
// questions, so a visitor is explicitly told what the preview lets them
// evaluate before they buy.
const POINTS = [
  'Sample questions',
  'Answer format',
  'Explanation format',
  'Practice experience',
  'General platform functionality',
];

export function FreePreviewCallout({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-500/30 bg-brand-50 p-4 ${className}`}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-ink">Free preview</div>
      <ul className="mb-3 grid grid-cols-1 gap-1 text-sm text-ink sm:grid-cols-2">
        {POINTS.map((p) => (
          <li key={p}>✓ {p}</li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">
        We recommend using the free preview before purchasing. The preview is provided to help
        you evaluate whether the product meets your learning requirements.
      </p>
    </div>
  );
}
