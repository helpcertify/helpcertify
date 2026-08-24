import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';

// Independent, server-to-server confirmation that a payment actually
// completed — the second (and more reliable) half of api/checkout.ts's
// verifyPayment. That client callback can simply never fire (closed tab,
// lost network, browser crash right after paying) even though Razorpay
// captured the money; this webhook is Razorpay calling *us*, so it doesn't
// depend on the student's browser at all. Register this URL
// (https://<domain>/api/razorpay-webhook) plus a webhook secret in the
// Razorpay Dashboard → Settings → Webhooks, subscribed to "payment.captured"
// — that's a Razorpay-dashboard action only the account owner can do.
//
// No Firebase auth here — the caller is Razorpay's servers, not a signed-in
// user. Authenticity instead comes from the X-Razorpay-Signature header,
// an HMAC-SHA256 of the *raw* request body using the webhook secret. That
// means Vercel's automatic JSON body-parsing has to be turned off (a parsed
// body re-serialized wouldn't byte-for-byte match what Razorpay signed) —
// hence reading the stream manually below.
//
// Self-contained — see api/auth.ts's header comment for why (no shared code
// across api/*.ts). finalizeOrder duplicates api/checkout.ts's function of
// the same name rather than importing it; it's intentionally idempotent
// (no-ops once an order is already 'paid') so it's safe if both this webhook
// and the client's verifyPayment call land for the same order.
export const config = { api: { bodyParser: false } };

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
const db = getFirestore(getAdminApp());
db.settings({ ignoreUndefinedProperties: true });

type ItemType = 'quiz' | 'practiceTest';

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
  batch.set(db.collection('carts').doc(order.userId), { items: [], couponCode: null, updatedAt: Timestamp.now() }, { merge: true });
  await batch.commit();

  return 'paid';
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const raw = await readRawBody(req);
  const signatureHeader = req.headers['x-razorpay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  if (event.event !== 'payment.captured') {
    // Acknowledge anything we don't act on so Razorpay stops retrying it.
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id;
  const razorpayPaymentId = payment?.id;
  if (!razorpayOrderId || !razorpayPaymentId) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  try {
    const ordersSnap = await db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1).get();
    if (ordersSnap.empty) {
      console.error('razorpay-webhook: no order found for', razorpayOrderId);
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    await finalizeOrder(ordersSnap.docs[0].id, razorpayPaymentId);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('razorpay-webhook handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
