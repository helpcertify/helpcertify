// Thin wrapper around Razorpay's own Checkout.js - loaded from their CDN at
// call time (not bundled; this is how Razorpay's integration is meant to
// work) rather than eagerly on every page load, since most visitors never
// reach checkout.

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface RazorpayCheckoutOptions {
  keyId: string;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  onSuccess: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onDismiss?: () => void;
}

export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions): Promise<void> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Payment gateway failed to load. Please try again.');
  const rzp = new window.Razorpay({
    key: opts.keyId,
    amount: opts.amount,
    currency: opts.currency,
    order_id: opts.razorpayOrderId,
    name: opts.name,
    description: opts.description,
    prefill: opts.prefill,
    theme: { color: '#14b8a6' },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.open();
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}
