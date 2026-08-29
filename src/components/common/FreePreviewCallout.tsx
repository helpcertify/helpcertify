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
    <div className={`rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 ${className}`}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Free preview</div>
      <ul className="mb-3 grid grid-cols-1 gap-1 text-sm text-[#1E293B] sm:grid-cols-2">
        {POINTS.map((p) => (
          <li key={p}>✓ {p}</li>
        ))}
      </ul>
      <p className="text-xs text-[#475569]">
        We recommend using the free preview before purchasing. The preview is provided to help
        you evaluate whether the product meets your learning requirements.
      </p>
    </div>
  );
}
