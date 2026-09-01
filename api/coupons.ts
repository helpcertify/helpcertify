import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Admin-managed discount coupons for the cart/checkout flow. Self-contained
// - see api/auth.ts's header comment for why (no shared code across
// api/*.ts).

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
  permissionDenied: (m = 'You do not have permission to perform this action') => new HttpError(403, m),
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  conflict: (m: string) => new HttpError(409, m),
};

async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
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
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  if (user.role !== 'admin') throw Err.permissionDenied();
  return { uid: decoded.uid };
}

// discountValue for 'percent' is capped at 95 - a 100%-off coupon would zero
// out an order entirely, which api/cart.ts's computeDiscount already guards
// against at apply-time, but rejecting it here too means the admin UI never
// even offers to create one.
const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  discountType: z.enum(['percent', 'flat']),
  discountValue: z.number().int().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
});

async function createCoupon(uid: string, body: unknown) {
  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  if (d.discountType === 'percent' && d.discountValue > 95) {
    throw Err.invalidArgument('Percent discounts are capped at 95% (a 100% coupon would zero out the order)');
  }
  const code = d.code.toUpperCase();

  const ref = db.collection('coupons').doc(code);
  if ((await ref.get()).exists) throw Err.conflict(`Coupon code "${code}" already exists`);

  await ref.set({
    discountType: d.discountType,
    discountValue: d.discountValue,
    active: true,
    expiresAt: d.expiresAt ? Timestamp.fromDate(new Date(d.expiresAt)) : null,
    maxUses: d.maxUses ?? null,
    usedCount: 0,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { code };
}

async function listCoupons() {
  const snap = await db.collection('coupons').orderBy('createdAt', 'desc').get();
  return { coupons: snap.docs.map((d) => ({ code: d.id, ...d.data() })) };
}

const codeSchema = z.object({ code: z.string().min(1) });

const updateCouponSchema = z.object({
  code: z.string().min(1),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
});

async function updateCoupon(body: unknown) {
  const parsed = updateCouponSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { code, expiresAt, ...rest } = parsed.data;

  const ref = db.collection('coupons').doc(code.toUpperCase());
  if (!(await ref.get()).exists) throw Err.notFound('Coupon not found');

  const update: Record<string, unknown> = { ...rest };
  if (expiresAt !== undefined) update.expiresAt = expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null;
  await ref.update(update);
  return { success: true };
}

async function deleteCoupon(body: unknown) {
  const parsed = codeSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('coupons').doc(parsed.data.code.toUpperCase());
  if (!(await ref.get()).exists) throw Err.notFound('Coupon not found');
  await ref.delete();
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireAdmin(req);

    switch (action) {
      case 'createCoupon':
        res.status(200).json(await createCoupon(uid, data));
        return;
      case 'listCoupons':
        res.status(200).json(await listCoupons());
        return;
      case 'updateCoupon':
        res.status(200).json(await updateCoupon(data));
        return;
      case 'deleteCoupon':
        res.status(200).json(await deleteCoupon(data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('coupons handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
