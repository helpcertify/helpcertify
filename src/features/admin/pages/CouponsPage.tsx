import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponsApi, type CouponSummary, type CreateCouponPayload } from '../api/couponsApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { errorText } from '@/lib/errorMessages';

export function CouponsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'coupons'], queryFn: couponsApi.listCoupons });

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat' | 'fixed_price'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [requiresUnlockCode, setRequiresUnlockCode] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: CreateCouponPayload = {
        code: code.trim(),
        discountType,
        discountValue:
          discountType === 'percent' ? Number(discountValue) : Math.round(Number(discountValue) * 100),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxUses: maxUses ? Number(maxUses) : null,
        requiresUnlockCode,
      };
      return couponsApi.createCoupon(payload);
    },
    onSuccess: () => {
      pushToast('Coupon created', 'success');
      setCode('');
      setDiscountValue('10');
      setExpiresAt('');
      setMaxUses('');
      setRequiresUnlockCode(false);
      invalidate();
    },
    onError: (err) => pushToast(errorText(err, 'Could not create coupon'), 'error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (args: { code: string; active: boolean }) => couponsApi.updateCoupon(args),
    onSuccess: invalidate,
    onError: () => pushToast('Could not update coupon', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => couponsApi.deleteCoupon(code),
    onSuccess: () => {
      pushToast('Coupon deleted', 'success');
      invalidate();
    },
    onError: () => pushToast('Could not delete coupon', 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Promo Codes</h1>
      <p className="mb-6 text-sm text-ink-faint">Discount codes redeemable in the learner cart at checkout.</p>

      <div className="mb-8 rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-4 font-medium text-ink">Create Coupon</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. LAUNCH25"
              className="input-dark"
            />
          </Field>
          <Field label="Type">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent' | 'flat' | 'fixed_price')}
              className="input-dark"
            >
              <option value="percent">Percent off</option>
              <option value="flat">Flat amount off (₹)</option>
              <option value="fixed_price">Fixed price (₹) - every item becomes this price</option>
            </select>
          </Field>
          <Field
            label={
              discountType === 'percent'
                ? 'Percent (max 95)'
                : discountType === 'flat'
                  ? 'Amount off (₹)'
                  : 'Fixed price (₹)'
            }
          >
            <input
              type="number"
              min={1}
              max={discountType === 'percent' ? 95 : undefined}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="input-dark"
            />
          </Field>
          <Field label="Max uses (optional)">
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" className="input-dark" />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Expires (optional)">
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input-dark" />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={requiresUnlockCode}
            onChange={(e) => setRequiresUnlockCode(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block font-medium text-ink">Requires a personal unlock code</span>
            <span className="block text-xs text-ink-faint">
              This coupon alone does nothing at checkout. A buyer must also enter a one-time unlock code you
              generate below for a specific salesperson or customer, and each unlock code only works once.
            </span>
          </span>
        </label>
        <button
          type="button"
          disabled={!code.trim() || !discountValue || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="mt-5 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'Create Coupon'}
        </button>
      </div>

      <div className="space-y-3">
        {(data?.coupons ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
            No coupons yet.
          </p>
        )}
        {data?.coupons.map((c) => (
          <CouponRow
            key={c.code}
            coupon={c}
            onToggleActive={() => toggleActiveMutation.mutate({ code: c.code, active: !c.active })}
            onDelete={() => deleteMutation.mutate(c.code)}
          />
        ))}
      </div>
    </div>
  );
}

function CouponRow({
  coupon: c,
  onToggleActive,
  onDelete,
}: {
  coupon: CouponSummary;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [showUnlockCodes, setShowUnlockCodes] = useState(false);
  const [generateCount, setGenerateCount] = useState('5');

  const { data: unlockData, refetch } = useQuery({
    queryKey: ['admin', 'coupons', 'unlockCodes', c.code],
    queryFn: () => couponsApi.listUnlockCodes(c.code),
    enabled: showUnlockCodes,
  });

  const generateMutation = useMutation({
    mutationFn: () => couponsApi.generateUnlockCodes(c.code, Number(generateCount)),
    onSuccess: () => {
      pushToast('Unlock codes generated', 'success');
      refetch();
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate unlock codes'), 'error'),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">{c.code}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${c.active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-800 text-ink-faint'}`}
            >
              {c.active ? 'Active' : 'Inactive'}
            </span>
            {c.requiresUnlockCode && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                Needs unlock code
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-ink-faint">
            {c.discountType === 'percent'
              ? `${c.discountValue}% off`
              : c.discountType === 'fixed_price'
                ? `Fixed price ₹${(c.discountValue / 100).toFixed(2)}`
                : `₹${(c.discountValue / 100).toFixed(2)} off`}
            {' · '}
            {c.usedCount} used{c.maxUses ? ` / ${c.maxUses} max` : ''}
            {c.expiresAt ? ` · expires ${toDate(c.expiresAt).toLocaleDateString()}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.requiresUnlockCode && (
            <button
              type="button"
              onClick={() => setShowUnlockCodes((v) => !v)}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted"
            >
              {showUnlockCodes ? 'Hide unlock codes' : 'Unlock codes'}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleActive}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted"
          >
            {c.active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-danger hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>

      {c.requiresUnlockCode && showUnlockCodes && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <div className="flex items-end gap-2">
            <Field label="Generate how many">
              <input
                type="number"
                min={1}
                max={200}
                value={generateCount}
                onChange={(e) => setGenerateCount(e.target.value)}
                className="input-dark w-28"
              />
            </Field>
            <button
              type="button"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {generateMutation.data && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="mb-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                New codes - copy these to your salespeople now, each works once:
              </p>
              <p className="break-all font-mono text-sm text-ink">{generateMutation.data.codes.join(', ')}</p>
            </div>
          )}

          <div className="mt-3 space-y-1">
            {(unlockData?.codes ?? []).length === 0 ? (
              <p className="text-sm text-ink-faint">No unlock codes generated yet.</p>
            ) : (
              unlockData?.codes.map((u) => (
                <div key={u.code} className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-1.5 text-sm">
                  <span className="font-mono text-ink">{u.code}</span>
                  <span className={u.used ? 'text-ink-faint' : 'text-emerald-700 dark:text-emerald-300'}>
                    {u.used ? 'Used' : 'Unused'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</label>
      {children}
    </div>
  );
}
