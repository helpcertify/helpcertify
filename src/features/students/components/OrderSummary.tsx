import { formatMoney, type SupportedCurrency } from '@/utils/currency';
import { accessPeriodLabel } from '../lib/accessPeriod';

export interface OrderSummaryItem {
  key: string;
  title: string;
  itemType: 'quiz' | 'practiceTest' | 'package';
  /** Question count for a quiz / practice test; omit for a package. */
  questionCount?: number;
  /** Access period in days (0 / undefined = lifetime). */
  accessPeriodDays?: number;
  price: number;
  originalPrice?: number | null;
}

const TYPE_LABEL: Record<OrderSummaryItem['itemType'], string> = {
  quiz: 'Mock Exam',
  practiceTest: 'Practice Exam',
  package: 'Package',
};

// The "YOU'RE PURCHASING" order summary shown before the Pay button on both
// checkout surfaces (BuyNowModal and CartPage). Every value is passed in -
// nothing about the product (name, question count, price, access period) is
// hard-coded here.
export function OrderSummary({
  items,
  currency,
  total,
}: {
  items: OrderSummaryItem[];
  currency: SupportedCurrency;
  /** Order total after any discount, when it differs from the line prices. */
  total?: number;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">You're purchasing</h3>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.key} className="border-b border-surface-border pb-3 last:border-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">{i.title}</div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {TYPE_LABEL[i.itemType]}
                  {typeof i.questionCount === 'number' && ` · ${i.questionCount} questions`}
                </div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  Access period: {accessPeriodLabel(i.accessPeriodDays)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {i.originalPrice && i.originalPrice > i.price && (
                  <div className="text-xs text-ink-faint line-through">{formatMoney(i.originalPrice, currency)}</div>
                )}
                <div className="font-semibold text-ink">{formatMoney(i.price, currency)}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {typeof total === 'number' && (
        <div className="mt-3 flex justify-between border-t border-surface-border pt-3 text-sm font-semibold text-ink">
          <span>Total</span>
          <span>{formatMoney(total, currency)}</span>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-faint">
        The final amount, including any coupon or credit, is shown on the next payment screen.
      </p>
    </div>
  );
}
