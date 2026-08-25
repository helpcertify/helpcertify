import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';

// Ratings & reviews for quizzes/practiceTests. Self-contained — see
// api/auth.ts's header comment for why (no shared code across api/*.ts).

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
};

async function requireStudent(req: VercelRequest): Promise<{ uid: string; name: string }> {
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

  return { uid: decoded.uid, name: (user.name as string) ?? '' };
}

type ItemType = 'quiz' | 'practiceTest';
const COLLECTION_BY_TYPE: Record<ItemType, string> = { quiz: 'quizzes', practiceTest: 'practiceTests' };

const itemRefSchema = z.object({
  itemType: z.enum(['quiz', 'practiceTest']),
  itemId: z.string().min(1),
});

// A student can only review something they actually own (free items count
// as owned too, same as every other owned-check in this app) — mirrors the
// paywall gate in quiz-session.ts/practice-session.ts rather than
// duplicating a fresh set of rules.
async function assertOwnsItem(uid: string, itemType: ItemType, itemId: string): Promise<DocumentReference> {
  const parentRef = db.collection(COLLECTION_BY_TYPE[itemType]).doc(itemId);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) throw Err.notFound('Item not found');
  const price = (parentSnap.data()?.price as number | undefined) ?? 0;
  if (price > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_${itemType}_${itemId}`).get();
    if (!purchaseSnap.exists) throw Err.permissionDenied('Purchase this to leave a review');
  }
  return parentRef;
}

// Reviews are only ever queried by itemId (not itemType too) on purpose —
// itemId is already globally unique (independent Firestore auto-ids), and a
// query needs no orderBy either (sorting happens in JS after the fetch, see
// listReviews below) so this stays a single-field equality filter Firestore
// auto-indexes, with no composite index to provision anywhere.
function reviewsForItemQuery(itemId: string) {
  return db.collection('reviews').where('itemId', '==', itemId);
}

const submitReviewSchema = itemRefSchema.extend({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).default(''),
});

async function submitReview(uid: string, name: string, body: unknown) {
  const parsed = submitReviewSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId, rating, comment } = parsed.data;
  const parentRef = await assertOwnsItem(uid, itemType, itemId);
  const reviewRef = db.collection('reviews').doc(`${uid}_${itemType}_${itemId}`);

  await db.runTransaction(async (t) => {
    // Recompute the aggregate from every OTHER review plus this one's new
    // rating, rather than an incremental FieldValue.increment — a full
    // recompute can't drift even if this ever runs concurrently with itself
    // (Firestore retries the transaction on contention) or if a past write
    // ever went missing.
    const [existingSnap, othersSnap] = await Promise.all([t.get(reviewRef), t.get(reviewsForItemQuery(itemId))]);
    const otherRatings = othersSnap.docs.filter((d) => d.id !== reviewRef.id).map((d) => d.data().rating as number);
    const ratings = [...otherRatings, rating];
    const ratingCount = ratings.length;
    const ratingAvg = ratings.reduce((a, b) => a + b, 0) / ratingCount;

    const now = FieldValue.serverTimestamp();
    t.set(reviewRef, {
      userId: uid,
      userName: name,
      itemType,
      itemId,
      rating,
      comment,
      createdAt: existingSnap.exists ? existingSnap.data()!.createdAt : now,
      updatedAt: now,
    });
    t.update(parentRef, { ratingAvg, ratingCount });
  });

  return { success: true };
}

async function deleteReview(uid: string, body: unknown) {
  const parsed = itemRefSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;
  const parentRef = db.collection(COLLECTION_BY_TYPE[itemType]).doc(itemId);
  const reviewRef = db.collection('reviews').doc(`${uid}_${itemType}_${itemId}`);

  await db.runTransaction(async (t) => {
    const [reviewSnap, othersSnap, parentSnap] = await Promise.all([
      t.get(reviewRef),
      t.get(reviewsForItemQuery(itemId)),
      t.get(parentRef),
    ]);
    if (!reviewSnap.exists) return; // nothing to delete, no-op
    const remaining = othersSnap.docs.filter((d) => d.id !== reviewRef.id).map((d) => d.data().rating as number);
    const ratingCount = remaining.length;
    const ratingAvg = ratingCount > 0 ? remaining.reduce((a, b) => a + b, 0) / ratingCount : 0;

    t.delete(reviewRef);
    if (parentSnap.exists) t.update(parentRef, { ratingAvg, ratingCount });
  });

  return { success: true };
}

async function listReviews(body: unknown) {
  const parsed = itemRefSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const snap = await reviewsForItemQuery(parsed.data.itemId).get();
  const millis = (d: FirebaseFirestore.QueryDocumentSnapshot) =>
    (d.data().updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  // Sorted here in JS (see reviewsForItemQuery's comment) rather than via
  // Firestore orderBy — on the snapshot docs, before spreading into the
  // response shape, since spreading DocumentData's index signature into an
  // object literal doesn't carry the signature through to the mapped type.
  const reviews = [...snap.docs].sort((a, b) => millis(b) - millis(a)).map((d) => ({ id: d.id, ...d.data() }));
  return { reviews };
}

async function getMyReview(uid: string, body: unknown) {
  const parsed = itemRefSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;
  const snap = await db.collection('reviews').doc(`${uid}_${itemType}_${itemId}`).get();
  return { review: snap.exists ? { id: snap.id, ...snap.data() } : null };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid, name } = await requireStudent(req);

    switch (action) {
      case 'submitReview':
        res.status(200).json(await submitReview(uid, name, data));
        return;
      case 'deleteReview':
        res.status(200).json(await deleteReview(uid, data));
        return;
      case 'listReviews':
        res.status(200).json(await listReviews(data));
        return;
      case 'getMyReview':
        res.status(200).json(await getMyReview(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('reviews handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
