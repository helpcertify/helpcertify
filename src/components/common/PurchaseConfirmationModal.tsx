import { Link } from 'react-router-dom';
import { formatMoney } from '@/utils/currency';
import type { PurchasableItemType } from '@/types/models';
import { ModalCloseButton } from './ModalCloseButton';

interface Item {
  itemType: PurchasableItemType | 'creatorProduct' | 'aiCreditPack';
  itemId: string;
  title: string;
}

// Shared across every checkout path (Cart, and each listing page's Buy Now)
// via useCheckout, so a purchase always ends the same clear way regardless
// of which route got the student there - a plain toast wasn't a strong
// enough confirmation, and only the Cart page had a dedicated success
// screen at all.
export function PurchaseConfirmationModal({
  items,
  amountPaid,
  currency,
  onClose,
}: {
  items: Item[];
  /** The amount actually charged, in minor units (paise/cents) - from the same order Razorpay confirmed. */
  amountPaid?: number;
  currency?: string;
  onClose: () => void;
}) {
  const hasPracticeTest = items.some((i) => i.itemType === 'practiceTest');
  const firstName = items[0]?.title;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} className="bg-white/15 text-white hover:bg-white/25 hover:text-white" />
        {/* A warm hero band (same brand-500 header convention as the
            purchase panel's "Your plan" card) instead of a plain white top -
            this is the one moment in checkout that should feel like a
            genuine "you did it", not just a form finishing. */}
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 px-6 pb-7 pt-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-4xl ring-4 ring-white/25">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold leading-tight">Payment Successful!</h2>
          <p className="mt-1.5 text-sm text-white/85">
            {items.length === 1
              ? `${firstName} is unlocked on your account now, with no time limit.`
              : `All ${items.length} items are unlocked on your account now, with no time limit.`}
          </p>
          {typeof amountPaid === 'number' && currency && (
            <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
              You paid {formatMoney(amountPaid, currency as 'INR' | 'USD')}
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="mb-5 space-y-2 text-left">
            {items.map((i) => (
              <div key={`${i.itemType}_${i.itemId}`} className="overflow-hidden rounded-lg border border-surface-border bg-surface">
                <Link
                  to={
                    i.itemType === 'quiz'
                      ? '/home'
                      : i.itemType === 'customExamBuilder'
                        ? '/home/custom-exams'
                        : '/home/practice-tests'
                  }
                  onClick={onClose}
                  className="block border-l-4 border-l-brand-500 px-4 py-3 hover:bg-brand-500/5"
                >
                  <div className="font-medium text-ink">{i.title}</div>
                  <div className="text-sm text-brand-ink">Go start it →</div>
                </Link>
                {i.itemType === 'practiceTest' && (
                  <Link
                    to={`/home/practice-tests/${i.itemId}?goal=1`}
                    onClick={onClose}
                    className="block border-t border-surface-border bg-warning/10 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/15"
                  >
                    🎯 Set My Study Goal
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* One informative line, not a wall of text: where the receipt
              lives, plus a nudge toward the Study Planner for a practice
              test purchase specifically (a quiz's fixed exam-style format
              has no daily target to set). */}
          <p className="mb-5 text-xs text-ink-faint">
            📄 Your receipt is saved under{' '}
            <Link to="/home/purchases" onClick={onClose} className="text-brand-ink hover:underline">
              Billing &amp; Orders
            </Link>
            .{' '}
            {hasPracticeTest
              ? 'Set a study goal to get a personalized daily target and track your progress toward exam day.'
              : "Good luck - you've got this!"}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-surface-border py-2.5 text-sm text-ink-muted hover:border-brand-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
