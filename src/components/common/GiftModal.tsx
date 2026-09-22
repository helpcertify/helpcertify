import { useState } from 'react';
import { ModalCloseButton } from './ModalCloseButton';
import type { GiftOrderDetails } from '@/features/students/api/cartApi';

interface Props {
  title: string;
  onClose: () => void;
  // Hands the collected recipient details up to the caller, which then
  // opens BuyNowModal (same consent/coupon/payment flow as an ordinary
  // Buy Now) with giftDetails set - this modal only collects who the gift
  // is for, it never touches payment itself.
  onContinue: (details: GiftOrderDetails) => void;
}

// Udemy-style "Gift this course" step: recipient name/email, an optional
// personal note, and either "send now" or a scheduled date (e.g. a
// birthday) - reached from the Gift icon on CertificationPurchasePanel's
// buy view. See api/checkout.ts's createOrder/finalizeOrder/claimGift for
// how the resulting order never grants the buyer anything, only the
// recipient once they claim it.
export function GiftModal({ title, onClose, onContinue }: Props) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [sendDate, setSendDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());
  const minDate = new Date().toISOString().slice(0, 10);

  const submit = () => {
    if (!recipientName.trim()) return setError("Enter the recipient's name");
    if (!emailValid) return setError("Enter a valid email for the recipient");
    if (scheduleLater && !sendDate) return setError('Pick a date to send this gift');
    setError(null);
    onContinue({
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      message: message.trim() || undefined,
      sendAt: scheduleLater && sendDate ? new Date(`${sendDate}T09:00:00`).toISOString() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-surface-border bg-surface-raised p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />
        <div className="mb-1 text-2xl" aria-hidden="true">
          🎁
        </div>
        <h2 className="mb-1 pr-8 text-xl font-bold text-ink">Gift this course</h2>
        <p className="mb-5 text-sm text-ink-faint">{title}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Recipient&rsquo;s name</label>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Full name"
              className="input-dark w-full"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Recipient&rsquo;s email</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="name@example.com"
              className="input-dark w-full"
            />
            <p className="mt-1 text-xs text-ink-faint">They&rsquo;ll need to sign in with this email to claim the gift.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Personal message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              placeholder="Good luck with your certification!"
              rows={3}
              className="input-dark w-full resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-surface-border p-3 text-sm">
            <input
              type="checkbox"
              checked={scheduleLater}
              onChange={(e) => setScheduleLater(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-ink">Schedule for later</span>
              <span className="block text-xs text-ink-faint">Send on a specific date instead of right away (e.g. a birthday).</span>
            </span>
          </label>
          {scheduleLater && (
            <input
              type="date"
              value={sendDate}
              min={minDate}
              onChange={(e) => setSendDate(e.target.value)}
              className="input-dark w-full"
            />
          )}
        </div>

        {error && <p className="mt-3 text-xs font-medium text-red-500">{error}</p>}

        <button
          type="button"
          onClick={submit}
          className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 font-medium text-white hover:bg-brand-600"
        >
          Continue to Payment
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted hover:border-brand-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
