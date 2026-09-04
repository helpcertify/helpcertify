import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '@/features/marketing/companyInfoStore';
import { whatsAppLink } from '@/lib/phoneLinks';

// A floating "how can we help" launcher, present site-wide (mounted once in
// App.tsx alongside ToastStack) - same pattern as Pluralsight's homepage
// widget the operator asked to match. Three quick actions, none of them
// needing new backend infra:
//  - "Chat with a live agent" deep-links to WhatsApp using the admin-
//    editable appSettings/company contactPhone (same phoneLinks.ts helper
//    the admin partner-verification feature uses).
//  - "Schedule a sales meeting" opens the operator's booking link.
//  - "Customer support" goes to the existing /support page - no new content.
const CALENDLY_URL = 'https://calendly.com/helpcertify/sales-meeting';

export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const company = useCompany();
  const waLink = whatsAppLink(company.contactPhone, 'IN');

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-2xl">
          <div className="mb-1 flex items-start justify-between">
            <h3 className="text-base font-bold text-ink">Welcome to {company.brand}!</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-ink-faint hover:text-ink"
            >
              ✕
            </button>
          </div>
          <p className="mb-4 text-sm text-ink-faint">We're here to help. Chat now, book a meeting, or get support.</p>

          <div className="space-y-2">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="block rounded-full border border-surface-border px-4 py-2 text-center text-sm font-medium text-ink hover:border-[#155EEF] hover:text-[#155EEF]"
              >
                Chat with a live agent
              </a>
            )}
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noreferrer"
              className="block rounded-full border border-surface-border px-4 py-2 text-center text-sm font-medium text-ink hover:border-[#155EEF] hover:text-[#155EEF]"
            >
              Schedule a sales meeting
            </a>
            <Link
              to="/support"
              onClick={() => setOpen(false)}
              className="block rounded-full border border-surface-border px-4 py-2 text-center text-sm font-medium text-ink hover:border-[#155EEF] hover:text-[#155EEF]"
            >
              I need customer support
            </Link>
          </div>

          <p className="mt-4 text-[11px] leading-snug text-ink-faint">
            WhatsApp opens in a new tab with our number pre-filled. We never ask for your password or payment details in chat.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close support menu' : 'Open support menu'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#155EEF] text-2xl text-white shadow-lg transition hover:bg-[#004EEB]"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
