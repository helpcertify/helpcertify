import type { ReactNode } from 'react';

// The dark left panel content is intentionally static (no data, no auth) -
// it repeats real product copy that also appears on the homepage
// (src/features/landing/pages/LandingPage.tsx's EXAM_PREP_FEATURES) rather
// than inventing new claims.
const VALUE_PROPS = [
  {
    title: 'Practise your weak areas',
    body: 'Large practice question banks in resumable, batched sessions, plus a focused mode that resurfaces the questions you get wrong most.',
    accent: '#14B8A6',
    icon: 'M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Detailed analytics',
    body: 'Ranked results with a per-question breakdown, so you can see exactly where to focus next.',
    accent: '#2F5FE0',
    icon: 'M9 19V10M15 19V5M4 19h16',
  },
  {
    title: 'Instant explanations',
    body: 'Practice mode tells you right away whether an answer was correct, with the reasoning behind it.',
    accent: '#7C3AED',
    icon: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  },
];

interface AuthSplitShellProps {
  children: ReactNode;
}

// Split-panel shell for the pre-login /login and /register screens: a dark
// value-prop panel (hidden below `lg`, where there isn't room for it) next
// to the actual form, which each page passes in as `children`. Pulled out
// of LoginPage/RegisterPage so both stay in sync instead of hand-rolling
// the same panel twice.
export function AuthSplitShell({ children }: AuthSplitShellProps) {
  return (
    <div className="flex flex-1">
      <div className="hidden w-[480px] shrink-0 flex-col justify-between bg-[#0F172A] p-12 lg:flex">
        <div>
          <div className="mb-10 inline-flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2F5FE0]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" />
                <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
              </svg>
            </div>
            <span className="text-lg font-extrabold text-white">HelpCertify</span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight text-white">
            Everything you need to get certified, in one place.
          </h1>
        </div>

        <div className="flex flex-col gap-6">
          {VALUE_PROPS.map((item) => (
            <div key={item.title} className="flex items-start gap-3.5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: item.accent }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2} aria-hidden="true">
                  <path d={item.icon} />
                </svg>
              </div>
              <div>
                <div className="text-[15.5px] font-bold text-white">{item.title}</div>
                <div className="mt-0.5 text-[13.5px] leading-relaxed text-[#C7CEDD]">{item.body}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="max-w-[420px] text-xs leading-relaxed text-[#7C8AA5]">
          HelpCertify is an independent learning, certification-preparation and assessment platform operated by
          IndyaBees.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
