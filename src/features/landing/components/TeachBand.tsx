import { Link } from 'react-router-dom';

// Recruitment band for trainers and subject-matter experts. Static,
// prerendered - no data, no auth. A dark navy CTA banner (fixed color, not
// the theme-switched surface tokens - it reads as a deliberate accent block
// in both light and dark mode, same idea as the gradient hero panel on
// LandingPage).
export function TeachBand() {
  return (
    <section className="border-t border-surface-border py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div
          className="flex flex-col gap-6 rounded-3xl px-8 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-12"
          style={{ backgroundColor: '#0F172A' }}
        >
          <div>
            <h2 className="text-2xl font-bold text-white">Teach on HelpCertify</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Publish your own courses, question banks and mock exams. Set your
              pricing, keep your content, and reach learners preparing for the
              certifications you know best - without building any exam software
              yourself.
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#2F5FE0] px-6 py-3 font-medium text-white transition hover:bg-[#1D3FA0]"
          >
            Start teaching
          </Link>
        </div>
      </div>
    </section>
  );
}
