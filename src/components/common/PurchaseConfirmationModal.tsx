import { Link } from 'react-router-dom';
import type { PurchasableItemType } from '@/types/models';

interface Item {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
}

// Shared across every checkout path (Cart, and each listing page's Buy Now)
// via useCheckout, so a purchase always ends the same clear way regardless
// of which route got the student there — a plain toast wasn't a strong
// enough confirmation, and only the Cart page had a dedicated success
// screen at all.
export function PurchaseConfirmationModal({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const hasPracticeTest = items.some((i) => i.itemType === 'practiceTest');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-surface-raised"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored hero, matching the app's own brand gradient rather than a
            plain white/gray success dialog — the checkmark itself stays
            semantic green (a "this worked" signal), kept separate from the
            blue brand accent behind it. */}
        <div className="bg-gradient-to-br from-[#1D4ED8] to-[#0f2f8f] px-8 pb-7 pt-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-3xl text-emerald-300">✓</div>
          <h2 className="mb-1 text-xl font-bold text-white">Payment Successful!</h2>
          <p className="text-sm text-white/80">
            {items.length === 1 ? "It's" : "They're"} unlocked on your account now, with no time limit.
          </p>
        </div>

        <div className="p-6">
          <div className="mb-5 space-y-2 text-left">
            {items.map((i) => (
              <div key={`${i.itemType}_${i.itemId}`} className="overflow-hidden rounded-lg border border-surface-border bg-surface">
                <Link
                  to={i.itemType === 'quiz' ? '/home' : '/home/practice-tests'}
                  onClick={onClose}
                  className="block border-l-4 border-l-[#1D4ED8] px-4 py-3 hover:bg-brand-500/5"
                >
                  <div className="font-medium text-ink">{i.title}</div>
                  <div className="text-sm text-brand-ink">Go start it →</div>
                </Link>
                {i.itemType === 'practiceTest' && (
                  <Link
                    to={`/home/practice-tests/${i.itemId}?goal=1`}
                    onClick={onClose}
                    className="block border-t border-surface-border bg-[#d87f1d]/10 px-4 py-2 text-sm font-medium text-[#d87f1d] hover:bg-[#d87f1d]/15"
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
            📄 Your receipt is saved under <Link to="/home/purchases" onClick={onClose} className="text-brand-ink hover:underline">Billing & Orders</Link>.{' '}
            {hasPracticeTest && 'Set a study goal to get a personalized daily target and track your progress toward exam day.'}
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
