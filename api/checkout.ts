import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';

// Razorpay checkout: create an Order server-side (recomputing every price
// from the live quiz/practiceTest docs — the client never gets to state an
// amount), then verify the payment signature Razorpay's Checkout.js hands
// back before granting entitlements. api/razorpay-webhook.ts is the second,
// independent confirmation path (in case the client never calls verifyPayment
// — closed tab, lost connection, etc.) — it duplicates the "mark paid + grant
// entitlements" logic below rather than importing it, matching this
// project's no-shared-code-across-api/*.ts convention (see api/auth.ts's
// header comment).

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin service account env vars are not configured');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const adminAuth = getAuth(getAdminApp());
const db = getFirestore(getAdminApp());
db.settings({ ignoreUndefinedProperties: true });

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
const Err = {
  unauthenticated: (m = 'Authentication required') => new HttpError(401, m),
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  failedPrecondition: (m: string) => new HttpError(409, m),
};

async function requireStudent(req: VercelRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }
  const snap = await db.collection('users').doc(decoded.uid).get();
  if (!snap.exists || !snap.data()?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  return { uid: decoded.uid };
}

type ItemType = 'quiz' | 'practiceTest';
const collectionFor = (itemType: ItemType) => (itemType === 'quiz' ? 'quizzes' : 'practiceTests');

function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay env vars are not configured');
  return { keyId, keySecret };
}

async function validateCoupon(code: string) {
  const snap = await db.collection('coupons').doc(code.toUpperCase()).get();
  if (!snap.exists) return null;
  const c = snap.data()!;
  if (!c.active) return null;
  if (c.expiresAt && (c.expiresAt as Timestamp).toMillis() < Date.now()) return null;
  if (c.maxUses !== null && c.maxUses !== undefined && c.usedCount >= c.maxUses) return null;
  return c;
}

function computeDiscount(coupon: FirebaseFirestore.DocumentData, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const raw = coupon.discountType === 'percent' ? Math.round((subtotal * coupon.discountValue) / 100) : coupon.discountValue;
  return Math.min(raw, Math.max(subtotal - 100, 0));
}

const createOrderSchema = z.object({
  // Buy Now: a direct, single-item order that bypasses the cart entirely —
  // no coupon involved, and (see finalizeOrder) doesn't touch whatever else
  // might be sitting in the student's actual cart.
  buyNowItem: z.object({ itemType: z.enum(['quiz', 'practiceTest']), itemId: z.string().min(1) }).optional(),
});

async function createOrder(uid: string, body: unknown) {
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { buyNowItem } = parsed.data;

  let cartItems: { itemType: ItemType; itemId: string }[];
  let couponCode: string | null;
  const fromCart = !buyNowItem;
  if (buyNowItem) {
    cartItems = [buyNowItem];
    couponCode = null;
  } else {
    const cartSnap = await db.collection('carts').doc(uid).get();
    cartItems = (cartSnap.exists ? cartSnap.data()!.items : []) as { itemType: ItemType; itemId: string }[];
    if (cartItems.length === 0) throw Err.failedPrecondition('Your cart is empty');
    couponCode = cartSnap.exists ? (cartSnap.data()!.couponCode ?? null) : null;
  }

  // Recompute everything from the live docs — never trust the cart (or any
  // client input) as a price source for a real payment.
  const orderItems: { itemType: ItemType; itemId: string; title: string; unitPrice: number }[] = [];
  let currency: 'INR' | 'USD' = 'INR';
  for (const entry of cartItems) {
    const snap = await db.collection(collectionFor(entry.itemType)).doc(entry.itemId).get();
    if (!snap.exists) continue; // deleted since being added — silently dropped, same as api/cart.ts
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_${entry.itemType}_${entry.itemId}`).get();
    if (purchaseSnap.exists) continue; // already owned — don't charge twice
    const data = snap.data()!;
    orderItems.push({ itemType: entry.itemType, itemId: entry.itemId, title: data.title, unitPrice: data.price ?? 0 });
    currency = data.currency ?? 'INR'; // api/cart.ts's addItem guarantees every item in a cart shares one currency
  }
  if (orderItems.length === 0) throw Err.failedPrecondition('Nothing left to check out: everything in your cart was already purchased');

  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice, 0);
  let discount = 0;
  let appliedCoupon: string | null = null;
  if (couponCode) {
    const coupon = await validateCoupon(couponCode);
    if (coupon) {
      discount = computeDiscount(coupon, subtotal);
      appliedCoupon = couponCode;
    }
  }
  const total = subtotal - discount;
  if (total <= 0) throw Err.failedPrecondition('Order total must be greater than zero');

  const { keyId, keySecret } = getRazorpayCreds();
  const orderRef = db.collection('orders').doc();

  const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: total, currency, receipt: orderRef.id }),
  });
  if (!rzpRes.ok) {
    const errBody = await rzpRes.text();
    console.error('Razorpay order creation failed:', rzpRes.status, errBody);
    // Most common cause of a currency-specific failure here: the Razorpay
    // account doesn't have international payments enabled yet, so a USD
    // order is rejected even though the request itself is well-formed.
    throw new Error(
      currency === 'USD'
        ? 'Could not create the payment order. This account may not have USD/international payments enabled yet.'
        : 'Could not create the payment order. Please try again.'
    );
  }
  const rzpOrder = (await rzpRes.json()) as { id: string };

  await orderRef.set({
    userId: uid,
    items: orderItems,
    couponCode: appliedCoupon,
    subtotal,
    discount,
    total,
    currency,
    razorpayOrderId: rzpOrder.id,
    razorpayPaymentId: null,
    status: 'created',
    fromCart,
    createdAt: Timestamp.now(),
    paidAt: null,
  });

  return { orderId: orderRef.id, razorpayOrderId: rzpOrder.id, amount: total, currency, keyId };
}

// Shared by both the client-verify path (here) and the webhook — kept as a
// small duplicated function rather than an import, per this project's
// no-shared-code-across-api/*.ts convention. Idempotent: safe to call twice
// for the same order (e.g. both the client callback and the webhook land)
// since it no-ops once status is already 'paid'.
async function finalizeOrder(orderId: string, razorpayPaymentId: string): Promise<'paid' | 'already_paid' | 'not_found'> {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return 'not_found';
  const order = snap.data()!;
  if (order.status === 'paid') return 'already_paid';

  await ref.update({ status: 'paid', razorpayPaymentId, paidAt: Timestamp.now() });

  const batch = db.batch();
  for (const item of order.items as { itemType: ItemType; itemId: string }[]) {
    batch.set(db.collection('purchases').doc(`${order.userId}_${item.itemType}_${item.itemId}`), {
      userId: order.userId,
      itemType: item.itemType,
      itemId: item.itemId,
      orderId,
      purchasedAt: Timestamp.now(),
    });
  }
  if (order.couponCode) {
    batch.update(db.collection('coupons').doc(order.couponCode), { usedCount: FieldValue.increment(1) });
  }
  // Only clear the cart for an order that actually came from it — a Buy Now
  // order (fromCart: false) must never wipe out unrelated items the
  // student still has sitting in their cart.
  if (order.fromCart) {
    batch.set(db.collection('carts').doc(order.userId), { items: [], couponCode: null, updatedAt: Timestamp.now() }, { merge: true });
  }
  await batch.commit();

  return 'paid';
}

const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

async function verifyPayment(uid: string, body: unknown) {
  const parsed = verifyPaymentSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Order not found');
  const order = snap.data()!;
  if (order.userId !== uid) throw Err.notFound('Order not found');
  if (order.razorpayOrderId !== razorpay_order_id) throw Err.invalidArgument('Order mismatch');

  const { keySecret } = getRazorpayCreds();
  const expected = createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(razorpay_signature);
  const valid = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  if (!valid) throw Err.invalidArgument('Payment signature could not be verified');

  await finalizeOrder(orderId, razorpay_payment_id);
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireStudent(req);

    switch (action) {
      case 'createOrder':
        res.status(200).json(await createOrder(uid, data));
        return;
      case 'verifyPayment':
        res.status(200).json(await verifyPayment(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('checkout handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
