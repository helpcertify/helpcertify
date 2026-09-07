import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { creatorCommerceApi, type CreatorProductView } from '@/features/creator/api/creatorCommerceApi';
import { useMyCreatorEntitlements } from '@/features/creator/hooks/useCreatorCommerce';
import { useCheckout } from '@/features/students/hooks/useCheckout';
import { CheckoutConsent } from '@/features/students/components/CheckoutConsent';
import { EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '@/features/students/lib/checkoutConsent';
import { computeOfferStatus } from '@/features/admin/lib/offerStatus';
import { ModalCloseButton } from '@/components/common/ModalCloseButton';
import { formatMoney } from '@/utils/currency';
import { toDate } from '@/utils/formatDate';
import type { CreatorEntitlement, CreatorPlanKey } from '@/types/models';

const ENTITLEMENT_LABEL: Record<CreatorEntitlement, string> = {
  course_creator_manual: 'Build courses manually',
  course_creator_ai: 'Generate courses with AI',
  exam_creator_manual: 'Author exams manually',
  exam_creator_ai: 'Generate exams with AI',
};

function planPrice(p: CreatorProductView, plan: CreatorPlanKey) {
  const pr = p.plans[plan];
  const status = computeOfferStatus(
    {
      offerPrice: pr.offerPrice,
      offerStart: pr.offerStart ? toDate(pr.offerStart) : null,
      offerEnd: pr.offerEnd ? toDate(pr.offerEnd) : null,
      offerCancelledAt: pr.offerCancelledAt ? toDate(pr.offerCancelledAt) : null,
    },
    new Date(),
  );
  const effective = status === 'active' && pr.offerPrice != null ? pr.offerPrice : pr.sellingPrice;
  const strike = pr.regularPrice > effective ? pr.regularPrice : null;
  return { effective, strike };
}

export function CreatorPlansPage() {
  const [plan, setPlan] = useState<CreatorPlanKey>('monthly');
  const [buying, setBuying] = useState<CreatorProductView | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['creator', 'plans'], queryFn: creatorCommerceApi.listProducts });
  const ent = useMyCreatorEntitlements();

  const products = data?.products ?? [];
  const individuals = products.filter((p) => p.kind === 'product');
  const bundles = products.filter((p) => p.kind === 'bundle');

  const ownsAll = (p: CreatorProductView) => p.entitlements.length > 0 && p.entitlements.every((e) => ent.has(e));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-ink">Creator plans</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-faint">
        Buy exactly the creation tools you need. Build courses and exams by hand, generate them with HelpCertify AI, or
        both. Every plan lasts for its term, then renews on your say-so.
      </p>

      <div className="mt-4 inline-flex rounded-lg border border-surface-border p-0.5 text-sm">
        {(['monthly', 'annual'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPlan(k)}
            className={`rounded-md px-4 py-1.5 font-medium ${plan === k ? 'bg-brand-500 text-white' : 'text-ink-muted hover:text-ink'}`}
          >
            {k === 'monthly' ? 'Monthly' : 'Annual'}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-ink-faint">Loading…</p>}
      {!isLoading && products.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
          Creator plans are not available yet.
        </p>
      )}

      {individuals.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Individual products</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {individuals.map((p) => (
              <PlanCard key={p.id} product={p} plan={plan} owned={ownsAll(p)} onBuy={() => setBuying(p)} />
            ))}
          </div>
        </>
      )}

      {bundles.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Bundles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {bundles.map((p) => (
              <PlanCard key={p.id} product={p} plan={plan} owned={ownsAll(p)} onBuy={() => setBuying(p)} />
            ))}
          </div>
        </>
      )}

      {buying && <ConfirmPlanModal product={buying} plan={plan} onClose={() => setBuying(null)} />}
    </div>
  );
}

function PlanCard({
  product,
  plan,
  owned,
  onBuy,
}: {
  product: CreatorProductView;
  plan: CreatorPlanKey;
  owned: boolean;
  onBuy: () => void;
}) {
  const { effective, strike } = planPrice(product, plan);
  const credits = product.aiCreditsIncluded[plan];
  const best = product.badgeText === 'Best Value';
  return (
    <div
      className={`flex h-full flex-col rounded-2xl border p-5 shadow-card ${best ? 'border-brand-500 ring-1 ring-brand-500' : 'border-surface-border bg-surface-raised'}`}
    >
      {product.badgeText && (
        <span className="mb-2 inline-block w-fit rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {product.badgeText}
        </span>
      )}
      <h3 className="text-base font-bold text-ink">{product.name}</h3>
      <p className="mt-1 text-xs text-ink-faint">{product.description}</p>

      <ul className="mt-3 space-y-1 text-xs text-ink-muted">
        {product.entitlements.map((e) => (
          <li key={e}>• {ENTITLEMENT_LABEL[e]}</li>
        ))}
        {credits > 0 && <li>• {credits.toLocaleString()} HelpCertify AI Credits / {plan === 'annual' ? 'year' : 'month'}</li>}
      </ul>

      <div className="mt-4">
        {strike != null && <span className="mr-1.5 text-xs text-ink-faint line-through">{formatMoney(strike, product.currency)}</span>}
        <span className="text-lg font-bold text-ink">{formatMoney(effective, product.currency)}</span>
        <span className="text-xs text-ink-faint"> / {plan === 'annual' ? 'year' : 'month'}</span>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={owned}
        className="mt-4 w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-default disabled:bg-surface-sunken disabled:text-ink-faint"
      >
        {owned ? 'You have this' : 'Subscribe'}
      </button>
    </div>
  );
}

function ConfirmPlanModal({ product, plan, onClose }: { product: CreatorProductView; plan: CreatorPlanKey; onClose: () => void }) {
  const { checkout, paying, confirmation } = useCheckout();
  const [consent, setConsent] = useState<CheckoutConsentState>(EMPTY_CONSENT);
  const { effective } = planPrice(product, plan);
  const title = `${product.name} - ${plan === 'annual' ? 'Annual' : 'Monthly'}`;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-border bg-surface-raised p-7" onClick={(e) => e.stopPropagation()}>
          <ModalCloseButton onClose={onClose} />
          <h2 className="mb-1 pr-8 text-xl font-bold text-ink">{title}</h2>
          <div className="mb-4 text-lg font-bold text-ink">
            {formatMoney(effective, product.currency)}
            <span className="text-sm font-normal text-ink-faint"> / {plan === 'annual' ? 'year' : 'month'}</span>
          </div>
          <p className="mb-4 text-sm text-ink-muted">
            Grants: {product.entitlements.map((e) => ENTITLEMENT_LABEL[e]).join(', ')}. Access lasts{' '}
            {plan === 'annual' ? '365 days' : '30 days'}; there is no auto-renewal.
          </p>

          <CheckoutConsent value={consent} onChange={setConsent} />

          <button
            type="button"
            disabled={paying || !allConsentsGiven(consent)}
            onClick={() =>
              checkout({
                items: [{ itemType: 'creatorProduct', itemId: product.id, title }],
                consent,
                buyNowItem: { itemType: 'creatorProduct', itemId: product.id, plan },
              })
            }
            className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {paying ? 'Opening…' : 'Pay & subscribe'}
          </button>
        </div>
      </div>
      {confirmation}
    </>
  );
}
