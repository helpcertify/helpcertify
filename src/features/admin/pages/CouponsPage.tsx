import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponsApi, type CreateCouponPayload } from '../api/couponsApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';

export function CouponsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'coupons'], queryFn: couponsApi.listCoupons });

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: CreateCouponPayload = {
        code: code.trim(),
        discountType,
        discountValue: discountType === 'flat' ? Math.round(Number(discountValue) * 100) : Number(discountValue),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxUses: maxUses ? Number(maxUses) : null,
      };
      return couponsApi.createCoupon(payload);
    },
    onSuccess: () => {
      pushToast('Coupon created', 'success');
      setCode('');
      setDiscountValue('10');
      setExpiresAt('');
      setMaxUses('');
      invalidate();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not create coupon', 'error'),
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
      <h1 className="mb-1 text-2xl font-semibold text-white">Coupons</h1>
      <p className="mb-6 text-sm text-neutral-500">Discount codes redeemable in the student cart at checkout.</p>

      <div className="mb-8 rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-4 font-medium text-white">Create Coupon</h2>
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
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'flat')} className="input-dark">
              <option value="percent">Percent off</option>
              <option value="flat">Flat amount off (₹)</option>
            </select>
          </Field>
          <Field label={discountType === 'percent' ? 'Percent (max 95)' : 'Amount (₹)'}>
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
        <button
          type="button"
          disabled={!code.trim() || !discountValue || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="mt-5 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'Create Coupon'}
        </button>
      </div>

      <div className="space-y-3">
        {(data?.coupons ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-neutral-500">
            No coupons yet.
          </p>
        )}
        {data?.coupons.map((c) => (
          <div key={c.code} className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-raised p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-white">{c.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-500'}`}>
                  {c.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-1 text-sm text-neutral-500">
                {c.discountType === 'percent' ? `${c.discountValue}% off` : `₹${(c.discountValue / 100).toFixed(2)} off`}
                {' · '}
                {c.usedCount} used{c.maxUses ? ` / ${c.maxUses} max` : ''}
                {c.expiresAt ? ` · expires ${toDate(c.expiresAt).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleActiveMutation.mutate({ code: c.code, active: !c.active })}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-neutral-300"
              >
                {c.active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(c.code)}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</label>
      {children}
    </div>
  );
}
