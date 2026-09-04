import { useCompany } from '@/features/marketing/companyInfoStore';

// The one small grey footer strip shared by every in-app page (student
// shell, admin shell, auth screens). The public marketing / legal pages
// keep their own richer footer (MarketingPage.tsx) because it also carries
// the statutory company + grievance details and must render in the static
// prerender. Links open the prerendered legal pages in a new tab so an
// in-progress session (a quiz, a half-filled form) is never navigated away.
const LINKS: { href: string; label: string }[] = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/refund', label: 'Refund & Cancellation Policy' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/support', label: 'Support Policy' },
  { href: '/contact', label: 'Contact' },
  { href: '/build-your-own-exam', label: 'Bring Your Own Question Bank' },
];

export function SiteFooter() {
  const COMPANY = useCompany();
  return (
    <footer className="sticky bottom-0 z-10 mt-auto border-t border-surface-border bg-surface-raised">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <nav className="flex flex-wrap gap-x-5 gap-y-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="hover:text-ink-muted">
              {l.label}
            </a>
          ))}
        </nav>
        <p className="shrink-0">
          &copy; {new Date().getFullYear()} {COMPANY.operatorName}. {COMPANY.brand} is a product and
          service of {COMPANY.operatorName}.
        </p>
      </div>
    </footer>
  );
}
