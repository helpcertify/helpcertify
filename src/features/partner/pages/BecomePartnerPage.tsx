import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerApi, type MyPartnerApplication } from '../api/partnerApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { VercelApiError } from '@/lib/apiError';
import { isAdult } from '../lib/partnerEligibility';
import { PARTNER_TYPE_LABELS } from '../lib/partnerTypeLabels';
import type { PartnerType } from '@/types/models';

const PARTNER_TYPES: { value: PartnerType; label: string; hint: string }[] = [
  { value: 'referral', label: PARTNER_TYPE_LABELS.referral, hint: 'Share a tracked link or code' },
  { value: 'sales', label: PARTNER_TYPE_LABELS.sales, hint: 'Register leads, demo and close' },
  { value: 'implementation', label: PARTNER_TYPE_LABELS.implementation, hint: 'Train or set up customers on the platform' },
];

const field =
  'w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand-500 dark:bg-transparent';
const labelCls = 'mb-1 block text-xs font-semibold text-ink-faint';

const STATUS_COPY: Record<string, { title: string; body: string; tone: string }> = {
  SUBMITTED: { title: 'Application received', body: "We're reviewing your application. You'll hear back by email.", tone: '#155EEF' },
  UNDER_REVIEW: { title: 'Under review', body: 'Your application is being reviewed.', tone: '#155EEF' },
  APPROVED: { title: "You're a partner", body: 'Your partner account is active. Promotion tools arrive soon.', tone: '#0B7A48' },
  REJECTED: { title: 'Not approved', body: 'This application was not approved.', tone: '#B32D1A' },
};

export function BecomePartnerPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['partner', 'myApplication'],
    queryFn: partnerApi.getMyApplication,
  });

  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [partnerType, setPartnerType] = useState<PartnerType>('referral');
  const [country, setCountry] = useState('IN');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [pan, setPan] = useState('');
  const [panName, setPanName] = useState('');
  const [gstin, setGstin] = useState('');
  const [panConsent, setPanConsent] = useState(false);
  const [accept, setAccept] = useState(false);

  const needsPan = country === 'IN';
  const panOk = !needsPan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());

  const submit = useMutation({
    mutationFn: () =>
      partnerApi.submitApplication({
        legalName: legalName.trim(),
        displayName: displayName.trim(),
        dateOfBirth,
        phone: phone.trim(),
        partnerType,
        country,
        addressLine: addressLine.trim(),
        city: city.trim(),
        state: stateName.trim(),
        postalCode: postalCode.trim(),
        pan: pan.trim() ? pan.trim().toUpperCase() : undefined,
        panName: panName.trim() || undefined,
        gstin: gstin.trim() ? gstin.trim().toUpperCase() : undefined,
        acceptAgreement: true,
        panConsent: needsPan ? panConsent : undefined,
      }),
    onSuccess: (res) => {
      // Show the confirmation card immediately - don't make the user wait on
      // a refetch round-trip (or worse, miss a toast) to know it worked.
      // See the note on retryable-looking duplicate submits below.
      const optimistic: MyPartnerApplication = {
        id: res.applicationId,
        status: res.status,
        partnerType,
        reviewNote: null,
        partnerId: null,
      };
      queryClient.setQueryData(['partner', 'myApplication'], { application: optimistic });
      pushToast("Application submitted. We'll review it and email you.", 'success');
      queryClient.invalidateQueries({ queryKey: ['partner', 'myApplication'] });
    },
    onError: (err) => {
      // A 409 here almost always means an earlier submit from this same
      // session already went through (e.g. a slow response the user
      // resubmitted against) - refetch so the confirmation card replaces
      // the form instead of leaving the user stuck looking at a red error
      // next to a form that appears to have done nothing.
      if (err instanceof VercelApiError && err.status === 409) {
        pushToast("You've already submitted an application - here's its status.", 'info');
        queryClient.invalidateQueries({ queryKey: ['partner', 'myApplication'] });
        return;
      }
      pushToast(errorText(err, 'Could not submit your application'), 'error');
    },
  });

  const adultOk = !dateOfBirth || isAdult(dateOfBirth, new Date());
  const canSubmit =
    legalName.trim().length >= 2 &&
    displayName.trim().length >= 2 &&
    !!dateOfBirth &&
    adultOk &&
    phone.trim().length >= 6 &&
    addressLine.trim().length >= 4 &&
    city.trim().length >= 2 &&
    stateName.trim().length >= 2 &&
    postalCode.trim().length >= 3 &&
    panOk &&
    (!needsPan || panConsent) &&
    accept &&
    !submit.isPending;

  const existing = data?.application ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-ink">Become a partner</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Promote HelpCertify with your own referral link and earn commission on every purchase you bring in.
      </p>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : existing ? (
        <div
          className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card"
          style={{ borderLeft: `3px solid ${STATUS_COPY[existing.status]?.tone ?? '#155EEF'}` }}
        >
          <h2 className="text-base font-bold text-ink">{STATUS_COPY[existing.status]?.title ?? existing.status}</h2>
          <p className="mt-1 text-sm text-ink-faint">{STATUS_COPY[existing.status]?.body}</p>
          {existing.reviewNote && <p className="mt-2 text-sm text-ink-faint">Note: {existing.reviewNote}</p>}
          {existing.status === 'APPROVED' && (
            <Link to="/home" className="mt-4 inline-block text-sm font-semibold text-brand-ink hover:underline">
              Back to home →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Full legal name</label>
              <input className={field} value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <label className={labelCls}>Display name</label>
              <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="Shown on your referral profile" />
            </div>
            <div>
              <label className={labelCls}>Date of birth</label>
              <input className={field} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              {!adultOk && <p className="mt-1 text-xs text-danger">You must be at least 18.</p>}
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+91 …" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Address</label>
              <input className={field} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} maxLength={200} placeholder="House / street / area" />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={field} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input className={field} value={stateName} onChange={(e) => setStateName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className={labelCls}>Postal code</label>
              <input className={field} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={12} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <select className={field} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())}>
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="AE">United Arab Emirates</option>
                <option value="SG">Singapore</option>
              </select>
            </div>
          </div>

          {needsPan && (
            <div className="rounded-lg border border-surface-border bg-surface-sunken p-4 dark:border-surface-border dark:bg-transparent">
              <p className="mb-3 text-xs text-ink-faint">
                PAN is required to pay commission to an India-based partner (tax identity, TDS compliance and payout
                reconciliation). It is stored securely, shown masked to staff, and never used for anything else.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>PAN</label>
                  <input
                    className={field}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="AAAAA9999A"
                  />
                  {pan && !panOk && <p className="mt-1 text-xs text-danger">That PAN is not in a valid format.</p>}
                </div>
                <div>
                  <label className={labelCls}>Name on PAN (optional)</label>
                  <input className={field} value={panName} onChange={(e) => setPanName(e.target.value)} maxLength={120} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>GSTIN (optional)</label>
                  <input className={field} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="22AAAAA0000A1Z5" />
                </div>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-ink">
                <input type="checkbox" className="mt-0.5" checked={panConsent} onChange={(e) => setPanConsent(e.target.checked)} />
                <span>
                  I understand my PAN is collected for partner identity and tax validation, TDS compliance, payout
                  processing and legally required records, as described in the{' '}
                  <Link to="/privacy" className="text-brand-ink hover:underline">privacy notice</Link>.
                </span>
              </label>
            </div>
          )}

          <div>
            <label className={labelCls}>Partner type</label>
            <div className="space-y-2">
              {PARTNER_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    partnerType === t.value ? 'border-brand-500 bg-brand-50' : 'border-surface-border hover:border-brand-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="partnerType"
                    className="mt-0.5"
                    checked={partnerType === t.value}
                    onChange={() => setPartnerType(t.value)}
                  />
                  <span>
                    <span className="block font-semibold text-ink">{t.label}</span>
                    <span className="block text-xs text-ink-faint">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              I am 18 or older and I accept the{' '}
              <Link to="/terms" className="text-brand-ink hover:underline">
                partner agreement
              </Link>
              . I will not make false certification, employment or income claims.
            </span>
          </label>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submit.isPending ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      )}
    </div>
  );
}
