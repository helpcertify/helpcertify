import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { creatorCommerceApi, type CreatorProductView, type CreditConfigView } from '@/features/creator/api/creatorCommerceApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney, majorToMinor, minorToMajor } from '@/utils/currency';
import { toDate } from '@/utils/formatDate';
import { computeOfferStatus } from '../lib/offerStatus';

const KEY = ['admin', 'creatorProducts'];
const toLocal = (v: unknown): string => {
  if (!v) return '';
  const d = toDate(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface PlanFields {
  regular: string;
  selling: string;
  offer: string;
  offerStart: string;
  offerEnd: string;
}
function planFieldsFrom(pr: CreatorProductView['plans']['monthly']): PlanFields {
  return {
    regular: String(minorToMajor(pr.regularPrice)),
    selling: String(minorToMajor(pr.sellingPrice)),
    offer: pr.offerPrice != null ? String(minorToMajor(pr.offerPrice)) : '',
    offerStart: toLocal(pr.offerStart),
    offerEnd: toLocal(pr.offerEnd),
  };
}

export function CreatorProductsTab() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: creatorCommerceApi.listAdmin });

  const seed = useMutation({
    mutationFn: creatorCommerceApi.seed,
    onSuccess: (r) => {
      pushToast(r.created > 0 ? `Seeded ${r.created} product(s)` : 'All products already exist', 'success');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => pushToast(errorText(e, 'Could not seed products'), 'error'),
  });

  const products = data?.products ?? [];
  const individuals = products.filter((p) => p.kind === 'product');
  const bundles = products.filter((p) => p.kind === 'bundle');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-faint">
          Four purchasable Creator products plus bundles, sold on monthly / annual plans. Every price, offer, AI-credit
          allowance and visibility below is editable here with no deploy. Existing purchases keep the price they were
          bought at.
        </p>
        <button
          type="button"
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
          className="shrink-0 rounded-lg border border-surface-border-strong px-3 py-1.5 text-sm font-medium text-ink-muted hover:border-brand-400 disabled:opacity-50"
        >
          {seed.isPending ? 'Seeding…' : products.length ? 'Seed missing products' : 'Seed products'}
        </button>
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
      {error && <p className="text-sm text-danger">Could not load the creator products.</p>}

      {products.length === 0 && !isLoading && (
        <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
          No creator products yet. Click “Seed products” to create the initial catalogue.
        </p>
      )}

      {individuals.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Products</h2>
          <div className="space-y-3">
            {individuals.map((p) => (
              <ProductEditor key={p.id} product={p} allProducts={products} />
            ))}
          </div>
        </section>
      )}

      {bundles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Bundles</h2>
          <div className="space-y-3">
            {bundles.map((p) => (
              <ProductEditor key={p.id} product={p} allProducts={products} />
            ))}
          </div>
        </section>
      )}

      {data?.creditConfig && <CreditConfigEditor config={data.creditConfig} />}
    </div>
  );
}

function effectivePriceLabel(p: CreatorProductView, plan: 'monthly' | 'annual'): string {
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
  const eff = status === 'active' && pr.offerPrice != null ? pr.offerPrice : pr.sellingPrice;
  return `${formatMoney(eff, p.currency)}${status === 'active' ? ' (offer)' : ''}`;
}

function ProductEditor({ product, allProducts }: { product: CreatorProductView; allProducts: CreatorProductView[] }) {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [badgeText, setBadgeText] = useState(product.badgeText ?? '');
  const [active, setActive] = useState(product.active);
  const [visible, setVisible] = useState(product.visible);
  const [promoEligible, setPromoEligible] = useState(product.promoEligible);
  const [taxTreatment, setTaxTreatment] = useState(product.taxTreatment);
  const [displayOrder, setDisplayOrder] = useState(String(product.displayOrder));
  const [trialEnabled, setTrialEnabled] = useState(product.trial?.enabled ?? false);
  const [trialDays, setTrialDays] = useState(String(product.trial?.days ?? 0));
  const [creditsMonthly, setCreditsMonthly] = useState(String(product.aiCreditsIncluded.monthly));
  const [creditsAnnual, setCreditsAnnual] = useState(String(product.aiCreditsIncluded.annual));
  const [members, setMembers] = useState<string[]>(product.bundledProductIds);

  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [planDrafts, setPlanDrafts] = useState(() => ({
    monthly: planFieldsFrom(product.plans.monthly),
    annual: planFieldsFrom(product.plans.annual),
  }));
  const pd = planDrafts[plan];
  const setPd = (patch: Partial<PlanFields>) => setPlanDrafts((d) => ({ ...d, [plan]: { ...d[plan], ...patch } }));

  const save = useMutation({
    mutationFn: () =>
      creatorCommerceApi.upsert({
        productId: product.id,
        name: name.trim(),
        description: description.trim(),
        badgeText: badgeText.trim() || null,
        active,
        visible,
        promoEligible,
        taxTreatment,
        displayOrder: Number(displayOrder) || 0,
        trial: { enabled: trialEnabled, days: Number(trialDays) || 0 },
        aiCreditsIncluded: { monthly: Number(creditsMonthly) || 0, annual: Number(creditsAnnual) || 0 },
        ...(product.kind === 'bundle' ? { bundledProductIds: members } : {}),
        plans: {
          [plan]: {
            regularPrice: majorToMinor(Number(pd.regular) || 0),
            sellingPrice: majorToMinor(Number(pd.selling) || 0),
            offerPrice: pd.offer.trim() ? majorToMinor(Number(pd.offer)) : null,
            offerStart: pd.offerStart ? new Date(pd.offerStart).toISOString() : null,
            offerEnd: pd.offerEnd ? new Date(pd.offerEnd).toISOString() : null,
          },
        },
      }),
    onSuccess: () => {
      pushToast('Saved', 'success');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => pushToast(errorText(e, 'Could not save the product'), 'error'),
  });

  const memberOptions = allProducts.filter((p) => p.kind === 'product');

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-xl border border-surface-border bg-surface-raised"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-ink">{product.name}</span>
          {product.badgeText && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-ink">
              {product.badgeText}
            </span>
          )}
          {!product.active && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-faint">Inactive</span>}
          {!product.visible && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-faint">Hidden</span>}
        </span>
        <span className="text-xs text-ink-faint">
          {effectivePriceLabel(product, 'monthly')} / mo · {effectivePriceLabel(product, 'annual')} / yr
        </span>
      </summary>

      <div className="space-y-5 border-t border-surface-border p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Badge text (optional)">
            <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Best Value" className="input-dark" />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-dark max-w-2xl" />
        </Field>

        {product.kind === 'bundle' && (
          <Field label="Bundled products (grants the union of their entitlements)">
            <div className="flex flex-wrap gap-3">
              {memberOptions.map((m) => (
                <label key={m.id} className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={members.includes(m.id)}
                    onChange={(e) =>
                      setMembers((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))
                    }
                    className="h-4 w-4"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="rounded-lg border border-surface-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Plan pricing</span>
            <div className="inline-flex rounded-lg border border-surface-border p-0.5 text-xs">
              {(['monthly', 'annual'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPlan(k)}
                  className={`rounded-md px-3 py-1 font-medium ${plan === k ? 'bg-brand-500 text-white' : 'text-ink-muted'}`}
                >
                  {k === 'monthly' ? 'Monthly' : 'Annual'}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-faint">Edit and save one plan at a time.</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Regular / list price (₹)">
              <input type="number" min={0} value={pd.regular} onChange={(e) => setPd({ regular: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Selling price (₹)">
              <input type="number" min={0} value={pd.selling} onChange={(e) => setPd({ selling: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Offer price (₹, optional)">
              <input type="number" min={0} value={pd.offer} onChange={(e) => setPd({ offer: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Offer start">
              <input type="datetime-local" value={pd.offerStart} onChange={(e) => setPd({ offerStart: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Offer end">
              <input type="datetime-local" value={pd.offerEnd} onChange={(e) => setPd({ offerEnd: e.target.value })} className="input-dark" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="AI credits - monthly plan">
            <input type="number" min={0} value={creditsMonthly} onChange={(e) => setCreditsMonthly(e.target.value)} className="input-dark" />
          </Field>
          <Field label="AI credits - annual plan">
            <input type="number" min={0} value={creditsAnnual} onChange={(e) => setCreditsAnnual(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Tax treatment">
            <select value={taxTreatment} onChange={(e) => setTaxTreatment(e.target.value as typeof taxTreatment)} className="input-dark">
              <option value="inclusive">Tax-inclusive</option>
              <option value="exclusive">Tax-exclusive</option>
              <option value="exempt">Tax-exempt</option>
            </select>
          </Field>
          <Field label="Display order">
            <input type="number" min={0} value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className="input-dark" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" /> Active
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-4 w-4" /> Visible on storefront
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={promoEligible} onChange={(e) => setPromoEligible(e.target.checked)} className="h-4 w-4" /> Promo-code eligible
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={trialEnabled} onChange={(e) => setTrialEnabled(e.target.checked)} className="h-4 w-4" /> Trial
          </label>
          {trialEnabled && (
            <label className="flex items-center gap-2 text-sm text-ink">
              Days
              <input type="number" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="input-dark w-20" />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : `Save ${plan} plan + settings`}
        </button>
      </div>
    </details>
  );
}

function CreditConfigEditor({ config }: { config: CreditConfigView }) {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [costs, setCosts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(config.operationCosts).map(([k, v]) => [k, String(v)])),
  );
  const [enabled, setEnabled] = useState(config.enabled ?? false);
  const [resetRule, setResetRule] = useState(config.resetRule);
  const [rolloverCap, setRolloverCap] = useState(String(config.rolloverCap));
  const [providers, setProviders] = useState(config.providerEnabled);
  const [packs, setPacks] = useState(config.creditPacks);

  const save = useMutation({
    mutationFn: () =>
      creatorCommerceApi.setCreditConfig({
        enabled,
        operationCosts: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Number(v) || 0])),
        resetRule,
        rolloverCap: Number(rolloverCap) || 0,
        providerEnabled: providers,
        creditPacks: packs,
      }),
    onSuccess: () => {
      pushToast('AI credit config saved', 'success');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => pushToast(errorText(e, 'Could not save the credit config'), 'error'),
  });

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">HelpCertify AI Credits</h2>
      <p className="mb-4 max-w-2xl text-sm text-ink-faint">
        Credits gate every AI generation. Customers see a simple credit balance - never provider tokens.
      </p>

      <label className="mb-4 flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-ink dark:bg-brand-500/10">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        <span>
          <span className="font-semibold">Enforce credits &amp; sell Creator products</span> - the master switch for the
          whole Creator commercial model. While off, AI generation is never charged and existing users are unaffected.
        </span>
      </label>

      <Field label="Credits per AI operation">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(costs).map((op) => (
            <label key={op} className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink">
              <span className="capitalize">{op.replace(/_/g, ' ')}</span>
              <input
                type="number"
                min={0}
                value={costs[op]}
                onChange={(e) => setCosts((c) => ({ ...c, [op]: e.target.value }))}
                className="input-dark w-20"
              />
            </label>
          ))}
        </div>
      </Field>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Reset rule">
          <select value={resetRule} onChange={(e) => setResetRule(e.target.value as typeof resetRule)} className="input-dark">
            <option value="monthly_on_grant">Monthly, from the grant date</option>
            <option value="calendar_month">Calendar month (1st)</option>
            <option value="none">Never reset (top-up only)</option>
          </select>
        </Field>
        <Field label="Rollover cap (credits kept next period)">
          <input type="number" min={0} value={rolloverCap} onChange={(e) => setRolloverCap(e.target.value)} className="input-dark" />
        </Field>
        <Field label="AI providers">
          <div className="flex flex-wrap gap-3 pt-2">
            {(['gemini', 'openai', 'anthropic'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm capitalize text-ink">
                <input
                  type="checkbox"
                  checked={providers[k]}
                  onChange={(e) => setProviders((p) => ({ ...p, [k]: e.target.checked }))}
                  className="h-4 w-4"
                />
                {k}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Extra credit packs" hint="Sold through the normal checkout when a creator runs out.">
        <div className="space-y-2">
          {packs.map((pk, i) => (
            <div key={pk.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input value={pk.name} onChange={(e) => setPacks((c) => c.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="input-dark" />
              <input type="number" min={1} value={pk.credits} onChange={(e) => setPacks((c) => c.map((x, j) => (j === i ? { ...x, credits: Number(e.target.value) || 0 } : x)))} placeholder="Credits" className="input-dark" />
              <input type="number" min={0} value={minorToMajor(pk.priceMinor)} onChange={(e) => setPacks((c) => c.map((x, j) => (j === i ? { ...x, priceMinor: majorToMinor(Number(e.target.value) || 0) } : x)))} placeholder="₹" className="input-dark" />
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={pk.active} onChange={(e) => setPacks((c) => c.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} className="h-4 w-4" /> Active
              </label>
              <button type="button" onClick={() => setPacks((c) => c.filter((_, j) => j !== i))} className="rounded-md border border-danger/40 px-2 text-xs font-semibold text-danger hover:bg-danger-soft">
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPacks((c) => [...c, { id: `pack_${Date.now()}`, name: '', credits: 100, priceMinor: 0, currency: 'INR', active: true }])}
            className="text-xs font-semibold text-brand-ink hover:underline"
          >
            + Add pack
          </button>
        </div>
      </Field>

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {save.isPending ? 'Saving…' : 'Save credit config'}
      </button>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
