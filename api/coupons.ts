import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { randomBytes } from 'crypto';

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
  discountType: z.enum(['percent', 'flat', 'fixed_price']),
  discountValue: z.number().int().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  // See CouponDoc's own comment - true means this code does nothing on its
  // own until paired with a valid couponUnlockCodes/{CODE} generated via
  // generateUnlockCodes below.
  requiresUnlockCode: z.boolean().default(false),
});

async function createCoupon(uid: string, body: unknown) {
  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  if (d.discountType === 'percent' && d.discountValue > 95) {
    throw Err.invalidArgument('Percent discounts are capped at 95% (a 100% coupon would zero out the order)');
  }
  // fixed_price's discountValue is a target total, not an amount - a value
  // under ₹1 would zero out (or nearly zero out) every order it touches,
  // same reasoning as the percent cap above.
  if (d.discountType === 'fixed_price' && d.discountValue < 100) {
    throw Err.invalidArgument('A fixed price must be at least ₹1 (100 paise)');
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
    requiresUnlockCode: d.requiresUnlockCode,
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

// --- Unlock codes (companion one-time codes for a requiresUnlockCode
// coupon) - see CouponDoc's own comment for the full design. ---

function generateUnlockCodeString(): string {
  // 6 hex chars, uppercased - short enough to read/type over a phone call,
  // long enough that guessing one is impractical.
  return randomBytes(3).toString('hex').toUpperCase();
}

const generateUnlockCodesSchema = z.object({
  parentCouponCode: z.string().trim().min(1).max(40),
  count: z.number().int().min(1).max(500),
});

async function generateUnlockCodes(uid: string, body: unknown) {
  const parsed = generateUnlockCodesSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const parentCouponCode = parsed.data.parentCouponCode.toUpperCase();

  const couponSnap = await db.collection('coupons').doc(parentCouponCode).get();
  if (!couponSnap.exists) throw Err.notFound(`Coupon "${parentCouponCode}" not found`);

  const now = FieldValue.serverTimestamp();
  const codes: string[] = [];
  const batch = db.batch();
  for (let i = 0; i < parsed.data.count; i++) {
    // Collisions are astronomically unlikely at this scale (16^6 possible
    // codes), so a plain retry-free generate-and-set is fine - a genuine
    // collision would just overwrite, which db.batch() would silently do
    // twice for the same doc if it happened within one call, but two
    // separate generateUnlockCodes calls landing on the same code is not
    // realistically going to happen at the volumes this is used for.
    const code = generateUnlockCodeString();
    codes.push(code);
    batch.set(db.collection('couponUnlockCodes').doc(code), {
      parentCouponCode,
      used: false,
      usedBy: null,
      usedAt: null,
      createdBy: uid,
      createdAt: now,
    });
  }
  await batch.commit();

  return { codes };
}

async function listUnlockCodes(body: unknown) {
  const parsed = z.object({ parentCouponCode: z.string().trim().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  // Equality-only filter (no orderBy on a second field) - avoids needing a
  // composite index for what's a small, admin-only list; sorted in memory
  // instead, same convention used elsewhere in this codebase.
  const snap = await db
    .collection('couponUnlockCodes')
    .where('parentCouponCode', '==', parsed.data.parentCouponCode.toUpperCase())
    .get();
  const codes = snap.docs
    .map((d) => ({ code: d.id, ...d.data() }) as { code: string; createdAt?: { toMillis(): number } })
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  return { codes };
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
      case 'generateUnlockCodes':
        res.status(200).json(await generateUnlockCodes(uid, data));
        return;
      case 'listUnlockCodes':
        res.status(200).json(await listUnlockCodes(data));
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
