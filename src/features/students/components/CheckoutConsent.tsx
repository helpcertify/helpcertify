import { ALL_CONSENT, EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '../lib/checkoutConsent';

// One combined acknowledgement replaces the previous four separate boxes.
// Ticking it records all four consent keys (see checkoutConsent.ts) so the
// immutable purchase-consent record still itemises exactly what was agreed
// to, and api/checkout.ts's server-side z.literal(true) checks are
// unchanged. Links open in a new tab so checkout selections aren't lost.
export function CheckoutConsent({
  value,
  onChange,
}: {
  value: CheckoutConsentState;
  onChange: (next: CheckoutConsentState) => void;
}) {
  const cls = 'text-brand-ink underline hover:no-underline';
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener" className={cls}>
      {label}
    </a>
  );

  return (
    <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
      <input
        type="checkbox"
        checked={allConsentsGiven(value)}
        onChange={(e) => onChange(e.target.checked ? ALL_CONSENT : EMPTY_CONSENT)}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span>
        I have read and agree to the {link('/terms', 'Terms of Service')},{' '}
        {link('/refund', 'Refund & Cancellation Policy')}, {link('/privacy', 'Privacy Policy')} and{' '}
        {link('/support', 'Support Policy')}.
      </span>
    </label>
  );
}
