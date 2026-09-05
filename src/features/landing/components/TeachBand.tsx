import { Link } from 'react-router-dom';

// Recruitment band for trainers and subject-matter experts. Static,
// prerendered - no data, no auth.
export function TeachBand() {
  return (
    <section className="border-t border-surface-border bg-black/20 py-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink">Teach on HelpCertify</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Publish your own courses, question banks and mock exams. Set your
            pricing, keep your content, and reach learners preparing for the
            certifications you know best - without building any exam software
            yourself.
          </p>
        </div>
        <Link
          to="/register"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
        >
          Start teaching
        </Link>
      </div>
    </section>
  );
}
