import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoLockup from '@/assets/logo-lockup.png';
import { useCompany } from './companyInfoStore';

// Shared chrome for every public marketing / legal page. Deliberately
// self-contained: no theme store, no auth, no data fetching — so these
// pages render identically whether they're reached inside the SPA
// (BrowserRouter) or emitted as static HTML by scripts/prerender.mjs
// (StaticRouter). Styling uses the same Tailwind design tokens as the rest
// of the app (see src/styles/globals.css).

const FOOTER_LINKS: { to: string; label: string }[] = [
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/refund', label: 'Refund Policy' },
  { to: '/support', label: 'Support Policy' },
  { to: '/disclaimer', label: 'Disclaimer' },
];

export function MarketingPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const COMPANY = useCompany();
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" aria-label={`${COMPANY.brand} home`} className="flex items-center">
            <img src={logoLockup} alt={COMPANY.brand} className="h-8 w-auto object-contain" width={175} height={80} />
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-ink-faint hover:text-ink-muted"
          >
            &larr; Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-ink">{title}</h1>
        {intro ? <div className="mt-3 text-ink-faint">{intro}</div> : null}
        <div className="prose-marketing mt-8 space-y-6 text-ink-muted">{children}</div>
      </main>

      <footer className="border-t border-surface-border">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-faint">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-ink-muted">
                {l.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            &copy; {new Date().getFullYear()} {COMPANY.operatorName}. {COMPANY.brand} is a
            product and service of {COMPANY.operatorName}, {COMPANY.operatorType} &mdash;{' '}
            {COMPANY.registeredAddress}.
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Grievance redressal:{' '}
            <a href={`mailto:${COMPANY.grievanceEmail}`} className="hover:text-ink-muted underline">
              {COMPANY.grievanceEmail}
            </a>
            {COMPANY.grievanceOfficer ? ` (${COMPANY.grievanceOfficer})` : ''} &middot;{' '}
            <Link to="/contact" className="hover:text-ink-muted underline">How to raise a complaint</Link>
            . Policies last updated {COMPANY.legalLastUpdated}.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Small typographic helpers so each legal page stays readable without
// pulling in a Markdown renderer or the @tailwindcss/typography plugin.
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{heading}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-ink-muted">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-6 text-ink-muted">{children}</ul>;
}
