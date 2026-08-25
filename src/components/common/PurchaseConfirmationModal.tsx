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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-4xl">✓</div>
        <h2 className="mb-2 text-xl font-bold text-ink">Payment successful!</h2>
        <p className="mb-6 text-sm text-ink-faint">
          {items.length === 1 ? "It's" : "They're"} unlocked on your account now, with no time limit — come back and start whenever you're ready.
        </p>
        <div className="mb-6 space-y-2 text-left">
          {items.map((i) => (
            <Link
              key={`${i.itemType}_${i.itemId}`}
              to={i.itemType === 'quiz' ? '/home' : '/home/practice-tests'}
              onClick={onClose}
              className="block rounded-lg border border-surface-border bg-surface px-4 py-3 hover:border-brand-400"
            >
              <div className="font-medium text-ink">{i.title}</div>
              <div className="text-sm text-brand-ink">Go start it →</div>
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-surface-border py-2.5 text-sm text-ink-muted hover:border-brand-400"
        >
          Close
        </button>
      </div>
    </div>
  );
}
