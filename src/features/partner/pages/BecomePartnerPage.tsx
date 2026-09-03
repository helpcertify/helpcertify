import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerApi } from '../api/partnerApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { isAdult } from '../lib/partnerEligibility';
import type { PartnerType } from '@/types/models';

const PARTNER_TYPES: { value: PartnerType; label: string; hint: string }[] = [
  { value: 'referral', label: 'Referral Partner', hint: 'Share a tracked link or code' },
  { value: 'sales', label: 'Sales Partner', hint: 'Register leads, demo and close' },
  { value: 'implementation', label: 'Implementation Partner', hint: 'Configure or train customers' },
];

const field =
  'w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none focus:border-[#155EEF] dark:bg-transparent';
const labelCls = 'mb-1 block text-xs font-semibold text-[#64748B]';

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
  const [accept, setAccept] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      partnerApi.submitApplication({
        legalName: legalName.trim(),
        displayName: displayName.trim(),
        dateOfBirth,
        phone: phone.trim(),
        partnerType,
        acceptAgreement: true,
      }),
    onSuccess: () => {
      pushToast('Application submitted', 'success');
      queryClient.invalidateQueries({ queryKey: ['partner', 'myApplication'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not submit your application'), 'error'),
  });

  const adultOk = !dateOfBirth || isAdult(dateOfBirth, new Date());
  const canSubmit =
    legalName.trim().length >= 2 &&
    displayName.trim().length >= 2 &&
    !!dateOfBirth &&
    adultOk &&
    phone.trim().length >= 6 &&
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
          className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised"
          style={{ borderLeft: `3px solid ${STATUS_COPY[existing.status]?.tone ?? '#155EEF'}` }}
        >
          <h2 className="text-base font-bold text-ink">{STATUS_COPY[existing.status]?.title ?? existing.status}</h2>
          <p className="mt-1 text-sm text-ink-faint">{STATUS_COPY[existing.status]?.body}</p>
          {existing.reviewNote && <p className="mt-2 text-sm text-ink-faint">Note: {existing.reviewNote}</p>}
          {existing.status === 'APPROVED' && (
            <Link to="/home" className="mt-4 inline-block text-sm font-semibold text-[#155EEF] hover:underline">
              Back to home →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
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
              {!adultOk && <p className="mt-1 text-xs text-[#B32D1A]">You must be at least 18.</p>}
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+91 …" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Partner type</label>
            <div className="space-y-2">
              {PARTNER_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    partnerType === t.value ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:border-[#155EEF]'
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
              <Link to="/terms" className="text-[#155EEF] hover:underline">
                partner agreement
              </Link>
              . I will not make false certification, employment or income claims.
            </span>
          </label>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
            className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-50"
          >
            {submit.isPending ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      )}
    </div>
  );
}
