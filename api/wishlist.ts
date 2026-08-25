import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Student wishlist for quizzes/practice tests. Entirely Admin-SDK mediated,
// same reasoning as api/cart.ts (no local firestore.rules file in this
// repo). Self-contained — see api/auth.ts's header comment for why.

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

interface HydratedWishlistItem {
  itemType: ItemType;
  itemId: string;
  title: string;
  category: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
}

// Mirrors api/cart.ts's hydrateCart: never trust the stored list as a price/
// title source, and silently drop anything deleted or already purchased
// since being wishlisted — once it's owned, it's not something to buy
// later any more. Unlike the cart, a free item is never dropped just for
// being free (no checkout constraint applies here), so wishlisting
// something free to try later is a perfectly normal state.
async function hydrateWishlist(uid: string): Promise<{ items: HydratedWishlistItem[] }> {
  const ref = db.collection('wishlists').doc(uid);
  const snap = await ref.get();
  const stored = (snap.exists ? snap.data()!.items : []) as { itemType: ItemType; itemId: string }[];

  const items: HydratedWishlistItem[] = [];
  let dirty = false;
  for (const entry of stored) {
    const [itemSnap, purchaseSnap] = await Promise.all([
      db.collection(collectionFor(entry.itemType)).doc(entry.itemId).get(),
      db.collection('purchases').doc(`${uid}_${entry.itemType}_${entry.itemId}`).get(),
    ]);
    if (!itemSnap.exists || purchaseSnap.exists) {
      dirty = true;
      continue;
    }
    const data = itemSnap.data()!;
    items.push({
      itemType: entry.itemType,
      itemId: entry.itemId,
      title: data.title,
      category: data.category ?? 'Other',
      price: data.price ?? 0,
      originalPrice: data.originalPrice ?? null,
      currency: data.currency ?? 'INR',
    });
  }

  if (dirty) {
    await ref.set(
      {
        userId: uid,
        items: items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, addedAt: Timestamp.now() })),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  }

  return { items };
}

async function getWishlist(uid: string) {
  return hydrateWishlist(uid);
}

const itemSchema = z.object({ itemType: z.enum(['quiz', 'practiceTest']), itemId: z.string().min(1) });

async function addItem(uid: string, body: unknown) {
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;

  const itemSnap = await db.collection(collectionFor(itemType)).doc(itemId).get();
  if (!itemSnap.exists) throw Err.notFound('Item not found');

  const ref = db.collection('wishlists').doc(uid);
  const snap = await ref.get();
  const existing = (snap.exists ? snap.data()!.items : []) as { itemType: ItemType; itemId: string }[];
  if (existing.some((e) => e.itemType === itemType && e.itemId === itemId)) {
    return getWishlist(uid); // already wishlisted — no-op, not an error
  }

  await ref.set(
    {
      userId: uid,
      items: [...existing, { itemType, itemId, addedAt: Timestamp.now() }],
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return getWishlist(uid);
}

async function removeItem(uid: string, body: unknown) {
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;

  const ref = db.collection('wishlists').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return getWishlist(uid);
  const existing = (snap.data()!.items ?? []) as { itemType: ItemType; itemId: string }[];

  await ref.set(
    {
      items: existing.filter((e) => !(e.itemType === itemType && e.itemId === itemId)),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return getWishlist(uid);
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
      case 'getWishlist':
        res.status(200).json(await getWishlist(uid));
        return;
      case 'addItem':
        res.status(200).json(await addItem(uid, data));
        return;
      case 'removeItem':
        res.status(200).json(await removeItem(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('wishlist handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
