import { useCompany } from '@/features/marketing/companyInfoStore';
import type { CheckoutConsentState } from '../lib/checkoutConsent';

interface Row {
  key: keyof CheckoutConsentState;
  label: string;
}

// Exact wording from the purchase-consent requirement. None are pre-selected;
// the Pay button stays disabled until all four are ticked (allConsentsGiven),
// and api/checkout.ts re-checks the same four server-side.
const ROWS: Row[] = [
  {
    key: 'correctProduct',
    label:
      'I have reviewed the selected certification/product details and confirm that I am purchasing the correct product.',
  },
  {
    key: 'previewAcknowledged',
    label:
      'I understand that a free preview is available to evaluate the question format, answers, explanations and platform experience before purchase.',
  },
  {
    key: 'policiesAccepted',
    label:
      'I have read and agree to the Terms of Service, Refund & Cancellation Policy and Privacy Policy.',
  },
  {
    key: 'technicalPolicyAcknowledged',
    label:
      "I understand that technical issues will first be investigated and resolved in accordance with HelpCertify's Support Policy and that a technical issue does not automatically qualify for a refund.",
  },
];

// Links open in a new tab so the customer's checkout selections are never lost.
function PolicyLinks() {
  const COMPANY = useCompany();
  const cls = 'text-brand-ink underline hover:no-underline';
  return (
    <p className="text-xs text-ink-faint">
      <a href="/terms" target="_blank" rel="noopener" className={cls}>Terms of Service</a>
      {' · '}
      <a href="/refund" target="_blank" rel="noopener" className={cls}>Refund &amp; Cancellation Policy</a>
      {' · '}
      <a href="/privacy" target="_blank" rel="noopener" className={cls}>Privacy Policy</a>
      {' · '}
      <a href="/support" target="_blank" rel="noopener" className={cls}>Support Policy</a>
      {' · '}
      <a href={`mailto:${COMPANY.grievanceEmail}`} className={cls}>Contact / Grievance</a>
    </p>
  );
}

export function CheckoutConsent({
  value,
  onChange,
}: {
  value: CheckoutConsentState;
  onChange: (next: CheckoutConsentState) => void;
}) {
  return (
    <div className="space-y-3">
      <PolicyLinks />
      <div className="space-y-2.5">
        {ROWS.map((row) => (
          <label key={row.key} className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              checked={value[row.key]}
              onChange={(e) => onChange({ ...value, [row.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{row.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
