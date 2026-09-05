import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Student cart for paid quizzes/practice tests. Entirely Admin-SDK mediated
// (no direct client Firestore reads/writes to carts/coupons/purchases) -
// this repo has no local firestore.rules file at all (rules live outside
// this repo), so routing every cart operation through here means zero rules
// changes are ever needed for the payment feature. Self-contained - see
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
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  conflict: (m: string) => new HttpError(409, m),
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

type ItemType = 'quiz' | 'practiceTest' | 'package' | 'course';
// Was a two-way ternary defaulting to 'packages' - an explicit chain now
// that a fourth item type exists, so a 'course' can never silently fall
// through to the packages collection.
const collectionFor = (itemType: ItemType) => {
  if (itemType === 'quiz') return 'quizzes';
  if (itemType === 'practiceTest') return 'practiceTests';
  if (itemType === 'course') return 'courses';
  return 'packages';
};

// A package is never its own entitlement record (see PackageDoc's own
// comment in src/types/models.ts) - "already own this package" means every
// included quiz/practiceTest already has its own purchase doc, whether that
// happened by buying the bundle or by buying each item individually.
async function isPackageFullyOwned(uid: string, pkg: FirebaseFirestore.DocumentData): Promise<boolean> {
  const includedQuizIds: string[] = pkg.includedQuizIds ?? [];
  const includedPracticeTestIds: string[] = pkg.includedPracticeTestIds ?? [];
  if (includedQuizIds.length === 0 && includedPracticeTestIds.length === 0) return false;
  const refs = [
    ...includedQuizIds.map((id) => db.collection('purchases').doc(`${uid}_quiz_${id}`)),
    ...includedPracticeTestIds.map((id) => db.collection('purchases').doc(`${uid}_practiceTest_${id}`)),
  ];
  const snaps = await db.getAll(...refs);
  return snaps.every((s) => s.exists);
}

async function validateCoupon(code: string, uid: string) {
  const snap = await db.collection('coupons').doc(code.toUpperCase()).get();
  if (!snap.exists) return null;
  const c = snap.data()!;
  if (!c.active) return null;
  if (c.expiresAt && (c.expiresAt as Timestamp).toMillis() < Date.now()) return null;
  if (c.maxUses !== null && c.maxUses !== undefined && c.usedCount >= c.maxUses) return null;
  // Refer & Earn reward coupons are minted for one specific learner - see
  // CouponDoc.restrictedToUserId. Absent on every admin-created coupon, so
  // this never affects the normal any-signed-in-learner codes.
  if (c.restrictedToUserId && c.restrictedToUserId !== uid) return null;
  return c;
}

function computeDiscount(coupon: FirebaseFirestore.DocumentData, subtotal: number): number {
  if (subtotal <= 0) return 0;
  let raw: number;
  if (coupon.discountType === 'percent') {
    raw = Math.round((subtotal * coupon.discountValue) / 100);
  } else if (coupon.discountType === 'fixed_price') {
    // discountValue here is the target total, not an amount to take off -
    // never increases the price if the item is already cheaper than that.
    raw = Math.max(0, subtotal - coupon.discountValue);
  } else {
    raw = coupon.discountValue;
  }
  // Never let a coupon zero out an order entirely - Razorpay requires a
  // positive amount, and a free "purchase" isn't really a purchase. Cap the
  // discount so at least ₹1 (100 paise) remains payable.
  return Math.min(raw, Math.max(subtotal - 100, 0));
}

type Currency = 'INR' | 'USD';

interface HydratedItem {
  itemType: ItemType;
  itemId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: Currency;
  totalQuestions: number;
  // Access period shown in the checkout order summary. 0 = lifetime for a
  // quiz / practice test; a package uses its accessValidityDays.
  accessPeriodDays: number;
}

// See CouponDoc's own comment - true means the coupon does nothing on its
// own until paired with a valid, unused, matching couponUnlockCodes/{CODE}
// doc. Duplicated from api/checkout.ts per the no-shared-code-across-
// api/*.ts convention.
async function isUnlockCodeValid(couponCode: string, unlockCode: string | null | undefined): Promise<boolean> {
  if (!unlockCode) return false;
  const snap = await db.collection('couponUnlockCodes').doc(unlockCode.toUpperCase()).get();
  const data = snap.data();
  return !!data && data.used !== true && data.parentCouponCode === couponCode.toUpperCase();
}

// Re-reads every item's live price/title and drops anything deleted or
// already purchased through some other path - the cart is never trusted as
// a price source, only as a list of item references.
async function hydrateCart(
  uid: string
): Promise<{ items: HydratedItem[]; couponCode: string | null; unlockCode: string | null; dirty: boolean }> {
  const cartSnap = await db.collection('carts').doc(uid).get();
  const stored = cartSnap.exists ? (cartSnap.data()!.items as { itemType: ItemType; itemId: string }[]) : [];
  let storedCoupon: string | null = cartSnap.exists ? (cartSnap.data()!.couponCode ?? null) : null;
  let storedUnlockCode: string | null = cartSnap.exists ? (cartSnap.data()!.unlockCode ?? null) : null;

  const items: HydratedItem[] = [];
  let dirty = false;
  for (const entry of stored) {
    if (entry.itemType === 'package') {
      const pkgSnap = await db.collection('packages').doc(entry.itemId).get();
      if (!pkgSnap.exists || !pkgSnap.data()!.isPublished) {
        dirty = true; // deleted/unpublished since being added
        continue;
      }
      const pkgData = pkgSnap.data()!;
      if (await isPackageFullyOwned(uid, pkgData)) {
        dirty = true; // every included item already owned since being added
        continue;
      }
      items.push({
        itemType: 'package',
        itemId: entry.itemId,
        title: pkgData.name,
        price: pkgData.price ?? 0,
        originalPrice: pkgData.originalPrice ?? null,
        currency: pkgData.currency ?? 'INR',
        totalQuestions: 0,
        accessPeriodDays: pkgData.accessValidityDays ?? 0,
      });
      continue;
    }
    const [itemSnap, purchaseSnap] = await Promise.all([
      db.collection(collectionFor(entry.itemType)).doc(entry.itemId).get(),
      db.collection('purchases').doc(`${uid}_${entry.itemType}_${entry.itemId}`).get(),
    ]);
    if (!itemSnap.exists || purchaseSnap.exists) {
      dirty = true; // deleted item, or bought via another path since being added
      continue;
    }
    const data = itemSnap.data()!;
    items.push({
      itemType: entry.itemType,
      itemId: entry.itemId,
      title: data.title,
      price: data.price ?? 0,
      originalPrice: data.originalPrice ?? null,
      currency: data.currency ?? 'INR',
      totalQuestions: data.totalQuestions ?? 0,
      accessPeriodDays: data.accessPeriodDays ?? 0,
    });
  }

  if (storedCoupon) {
    const coupon = await validateCoupon(storedCoupon, uid);
    if (!coupon) {
      storedCoupon = null;
      storedUnlockCode = null;
      dirty = true; // coupon expired/deactivated since being applied - drop it silently
    } else if (coupon.requiresUnlockCode && !(await isUnlockCodeValid(storedCoupon, storedUnlockCode))) {
      // The unlock code was consumed elsewhere (another tab/device) since
      // being applied here - drop both silently, same as an expired coupon.
      storedCoupon = null;
      storedUnlockCode = null;
      dirty = true;
    }
  }

  if (dirty) {
    await db
      .collection('carts')
      .doc(uid)
      .set(
        {
          userId: uid,
          items: items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, addedAt: Timestamp.now() })),
          couponCode: storedCoupon,
          unlockCode: storedUnlockCode,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
  }

  return { items, couponCode: storedCoupon, unlockCode: storedUnlockCode, dirty };
}

async function summarize(uid: string) {
  const { items, couponCode, unlockCode } = await hydrateCart(uid);
  const currency: Currency = items[0]?.currency ?? 'INR';
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  let discount = 0;
  if (couponCode) {
    const coupon = await validateCoupon(couponCode, uid);
    if (coupon && (!coupon.requiresUnlockCode || (await isUnlockCodeValid(couponCode, unlockCode)))) {
      discount = computeDiscount(coupon, subtotal);
    }
  }
  return { items, couponCode, unlockCode, currency, subtotal, discount, total: subtotal - discount };
}

async function getCart(uid: string) {
  return summarize(uid);
}

const addItemSchema = z.object({ itemType: z.enum(['quiz', 'practiceTest', 'package', 'course']), itemId: z.string().min(1) });

async function addItem(uid: string, body: unknown) {
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;

  const itemSnap = await db.collection(collectionFor(itemType)).doc(itemId).get();
  if (!itemSnap.exists) throw Err.notFound('Item not found');
  const itemData = itemSnap.data()!;
  const price = itemData.price ?? 0;
  const itemCurrency: Currency = itemData.currency ?? 'INR';
  if (price <= 0) throw Err.invalidArgument('This item is free, no need to add it to your cart');

  // A package never has its own purchase doc - "already own" means every
  // included item is already owned (see isPackageFullyOwned).
  const alreadyOwned =
    itemType === 'package'
      ? await isPackageFullyOwned(uid, itemData)
      : (await db.collection('purchases').doc(`${uid}_${itemType}_${itemId}`).get()).exists;
  if (alreadyOwned) throw Err.conflict('You already own this item');

  const ref = db.collection('carts').doc(uid);
  const snap = await ref.get();
  const existing = (snap.exists ? snap.data()!.items : []) as { itemType: ItemType; itemId: string }[];
  if (existing.some((e) => e.itemType === itemType && e.itemId === itemId)) {
    return summarize(uid); // already in cart - no-op, not an error
  }

  // A Razorpay order is single-currency, so a cart can't mix them - caught
  // here (at add-time, where the student can actually act on it) rather
  // than at checkout.
  if (existing.length > 0) {
    const { items: existingHydrated } = await hydrateCart(uid);
    const cartCurrency = existingHydrated[0]?.currency;
    if (cartCurrency && cartCurrency !== itemCurrency) {
      throw Err.invalidArgument(
        `Your cart already has items priced in ${cartCurrency}. Check out or remove those first before adding a ${itemCurrency} item.`
      );
    }
  }

  await ref.set(
    {
      userId: uid,
      items: [...existing, { itemType, itemId, addedAt: Timestamp.now() }],
      couponCode: snap.exists ? (snap.data()!.couponCode ?? null) : null,
      unlockCode: snap.exists ? (snap.data()!.unlockCode ?? null) : null,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return summarize(uid);
}

async function removeItem(uid: string, body: unknown) {
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;

  const ref = db.collection('carts').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return summarize(uid);
  const existing = snap.data()!.items as { itemType: ItemType; itemId: string }[];
  await ref.update({
    items: existing.filter((e) => !(e.itemType === itemType && e.itemId === itemId)),
    updatedAt: Timestamp.now(),
  });
  return summarize(uid);
}

const couponCodeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  // Companion one-time code for a coupon created with requiresUnlockCode:
  // true (see CouponDoc). Ignored entirely if this coupon doesn't need one.
  unlockCode: z.string().trim().min(1).max(40).optional(),
});

async function applyCoupon(uid: string, body: unknown) {
  const parsed = couponCodeSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const code = parsed.data.code.toUpperCase();

  const coupon = await validateCoupon(code, uid);
  if (!coupon) throw Err.invalidArgument('This coupon code is invalid or has expired');

  let unlockCode: string | null = null;
  if (coupon.requiresUnlockCode) {
    if (!parsed.data.unlockCode) throw Err.invalidArgument('This code needs a personal unlock code to be used.');
    if (!(await isUnlockCodeValid(code, parsed.data.unlockCode))) {
      throw Err.invalidArgument('This unlock code is invalid, already used, or does not match this coupon.');
    }
    unlockCode = parsed.data.unlockCode.toUpperCase();
  }

  const ref = db.collection('carts').doc(uid);
  const snap = await ref.get();
  const existing = (snap.exists ? snap.data()!.items : []) as unknown[];
  if (existing.length === 0) throw Err.invalidArgument('Your cart is empty');

  await ref.set({ userId: uid, items: existing, couponCode: code, unlockCode, updatedAt: Timestamp.now() }, { merge: true });
  return summarize(uid);
}

async function listMyPurchases(uid: string) {
  const snap = await db.collection('purchases').where('userId', '==', uid).get();
  return {
    purchases: snap.docs.map((d) => ({
      itemType: d.data().itemType as ItemType,
      itemId: d.data().itemId as string,
      // Added for Billing & Orders' fuller product cards (purchase date) -
      // was already stored on every purchase doc, just never returned here.
      purchasedAt: d.data().purchasedAt as unknown,
      // Set on package-sourced purchases with a validity window. Absent /
      // null = lifetime. Client treats a past expiresAt as not-owned.
      expiresAt: (d.data().expiresAt ?? null) as unknown,
    })),
  };
}

async function removeCoupon(uid: string) {
  const ref = db.collection('carts').doc(uid);
  const snap = await ref.get();
  if (snap.exists) await ref.update({ couponCode: null, unlockCode: null, updatedAt: Timestamp.now() });
  return summarize(uid);
}

// ---------------------------------------------------------------------------
// Learner certification catalog - the "Choose Your Exam Preparation" home
// page section groups packages under their certification, with per-learner
// owned/in-cart state resolved server-side (never trusted from the client).
// Folded into this file for the same 12-function-cap reasoning as the
// wishlist actions below, and because resolving state needs exactly the
// purchases/carts reads this file already has helpers for.
// ---------------------------------------------------------------------------

type PackageState = 'AVAILABLE' | 'IN_CART' | 'ACTIVE' | 'COMING_SOON' | 'UNAVAILABLE';

async function getLearnerCatalog(uid: string) {
  const [certSnap, pkgSnap, purchasesSnap, cartSnap] = await Promise.all([
    db.collection('certifications').where('isPublished', '==', true).get(),
    db.collection('packages').where('isPublished', '==', true).get(),
    db.collection('purchases').where('userId', '==', uid).get(),
    db.collection('carts').doc(uid).get(),
  ]);

  // An expired package purchase (expiresAt in the past) no longer counts as
  // owned - the package shows as re-buyable and its content re-locks.
  const now = Date.now();
  const ownedSet = new Set(
    purchasesSnap.docs
      .filter((d) => {
        const exp = d.data().expiresAt as Timestamp | undefined | null;
        return !exp || exp.toMillis() >= now;
      })
      .map((d) => `${d.data().itemType}_${d.data().itemId}`),
  );
  const cartItems = (cartSnap.exists ? (cartSnap.data()!.items as { itemType: ItemType; itemId: string }[]) : []);
  const cartPackageIds = new Set(cartItems.filter((i) => i.itemType === 'package').map((i) => i.itemId));

  // One batched read for every quiz/practiceTest referenced by any package,
  // instead of a read per package per included item.
  const allQuizIds = new Set<string>();
  const allTestIds = new Set<string>();
  for (const doc of pkgSnap.docs) {
    for (const id of (doc.data().includedQuizIds ?? []) as string[]) allQuizIds.add(id);
    for (const id of (doc.data().includedPracticeTestIds ?? []) as string[]) allTestIds.add(id);
  }
  // db.getAll() throws when called with zero refs (e.g. no packages
  // published yet, or a certification whose packages have no quizzes
  // included) - guard each call rather than let an empty catalog 500.
  const [quizDocs, testDocs] = await Promise.all([
    allQuizIds.size > 0 ? db.getAll(...[...allQuizIds].map((id) => db.collection('quizzes').doc(id))) : Promise.resolve([]),
    allTestIds.size > 0 ? db.getAll(...[...allTestIds].map((id) => db.collection('practiceTests').doc(id))) : Promise.resolve([]),
  ]);
  const quizById = new Map(quizDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!]));
  const testById = new Map(testDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!]));

  const packagesByCert = new Map<string, Record<string, unknown>[]>();
  for (const doc of pkgSnap.docs) {
    const pkg = doc.data();
    const includedQuizIds: string[] = pkg.includedQuizIds ?? [];
    const includedPracticeTestIds: string[] = pkg.includedPracticeTestIds ?? [];
    const hasAnyIncluded = includedQuizIds.length + includedPracticeTestIds.length > 0;
    const allOwned =
      hasAnyIncluded &&
      includedQuizIds.every((id) => ownedSet.has(`quiz_${id}`)) &&
      includedPracticeTestIds.every((id) => ownedSet.has(`practiceTest_${id}`));
    const state: PackageState = allOwned ? 'ACTIVE' : cartPackageIds.has(doc.id) ? 'IN_CART' : 'AVAILABLE';
    // Practice-bank questions only - the real published count from the
    // uploaded question docs, used for the learner-facing "N questions"
    // figure (never the admin-typed accessibleQuestionCount).
    const practiceQuestionCount = includedPracticeTestIds.reduce(
      (sum, id) => sum + (testById.get(id)?.totalQuestions ?? 0),
      0,
    );
    const aggregateTotalQuestions =
      includedQuizIds.reduce((sum, id) => sum + (quizById.get(id)?.totalQuestions ?? 0), 0) + practiceQuestionCount;
    const includedItems = [
      ...includedQuizIds.map((id) => ({ itemType: 'quiz' as const, itemId: id, title: quizById.get(id)?.title ?? 'Mock Exam' })),
      ...includedPracticeTestIds.map((id) => ({
        itemType: 'practiceTest' as const,
        itemId: id,
        title: testById.get(id)?.title ?? 'Practice Test',
      })),
    ];
    const list = packagesByCert.get(pkg.certificationId as string) ?? [];
    list.push({ id: doc.id, ...pkg, state, aggregateTotalQuestions, practiceQuestionCount, includedItems });
    packagesByCert.set(pkg.certificationId as string, list);
  }

  const certifications = certSnap.docs
    .map((d) => {
      const packages = (packagesByCert.get(d.id) ?? []).sort(
        (a, b) => ((a.displayOrder as number) ?? 0) - ((b.displayOrder as number) ?? 0)
      );
      return { id: d.id, ...d.data(), packages };
    })
    .sort(
      (a, b) =>
        ((a as { displayOrder?: number }).displayOrder ?? 0) - ((b as { displayOrder?: number }).displayOrder ?? 0)
    );

  return { certifications };
}

// Unauthenticated, no per-user state - the logged-out landing page and the
// public /search page read this trimmed published catalog. Certifications/
// packages/reviews have no client-readable Firestore rule (Admin-SDK only),
// which is exactly why this lives as a server action rather than a client
// read. Every list is capped to card-sized fields.
async function getPublicCatalog() {
  const [certSnap, pkgSnap, coursesSnap, testsSnap, quizzesSnap] = await Promise.all([
    db.collection('certifications').where('isPublished', '==', true).get(),
    db.collection('packages').where('isPublished', '==', true).get(),
    db.collection('courses').where('isPublished', '==', true).get(),
    db.collection('practiceTests').get(),
    db.collection('quizzes').where('isPublished', '==', true).get(),
  ]);

  const pkgByCert = new Map<string, FirebaseFirestore.DocumentData[]>();
  for (const d of pkgSnap.docs) {
    const p = d.data();
    const list = pkgByCert.get(p.certificationId as string) ?? [];
    list.push(p);
    pkgByCert.set(p.certificationId as string, list);
  }

  const certifications = certSnap.docs
    .map((d) => {
      const c = d.data();
      const pkgs = pkgByCert.get(d.id) ?? [];
      const prices = pkgs
        .filter((p) => !p.isFree)
        .map((p) => p.sellingPrice as number)
        .filter((n) => typeof n === 'number' && n > 0);
      return {
        id: d.id,
        name: (c.name as string) ?? 'Certification',
        shortName: (c.shortName as string) ?? (c.name as string) ?? '',
        provider: (c.provider as string) ?? (c.category as string) ?? 'Other',
        shortDescription: (c.shortDescription as string) ?? '',
        packageCount: pkgs.length,
        fromPriceMinor: prices.length ? Math.min(...prices) : 0,
        currency: (pkgs[0]?.currency as 'INR' | 'USD') ?? 'INR',
      };
    })
    .filter((c) => c.packageCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const courses = coursesSnap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      title: (c.title as string) ?? 'Course',
      category: (c.category as string) ?? 'Other',
      skillLevel: (c.skillLevel as string) ?? 'Foundation',
      price: (c.price as number) ?? 0,
      originalPrice: (c.originalPrice as number | null) ?? null,
      currency: (c.currency as 'INR' | 'USD') ?? 'INR',
      ratingAvg: (c.ratingAvg as number) ?? 0,
      ratingCount: (c.ratingCount as number) ?? 0,
      totalLessons: (c.totalLessons as number) ?? 0,
      coverImageUrl: (c.coverImageUrl as string | null) ?? null,
      createdAtMs: c.createdAt ? (c.createdAt as Timestamp).toMillis() : 0,
    };
  });

  const practiceTests = testsSnap.docs.map((d) => {
    const t = d.data();
    return {
      id: d.id,
      title: (t.title as string) ?? 'Practice Test',
      category: (t.category as string) ?? 'Other',
      examName: (t.examName as string | null) ?? null,
      skillLevel: (t.skillLevel as string) ?? 'Foundation',
      price: (t.price as number) ?? 0,
      originalPrice: (t.originalPrice as number | null) ?? null,
      currency: (t.currency as 'INR' | 'USD') ?? 'INR',
      ratingAvg: (t.ratingAvg as number) ?? 0,
      ratingCount: (t.ratingCount as number) ?? 0,
      totalQuestions: (t.totalQuestions as number) ?? 0,
    };
  });

  const quizzes = quizzesSnap.docs.map((d) => {
    const q = d.data();
    return {
      id: d.id,
      title: (q.title as string) ?? 'Mock Exam',
      category: (q.category as string) ?? 'Other',
      skillLevel: (q.skillLevel as string) ?? 'Foundation',
      price: (q.price as number) ?? 0,
      originalPrice: (q.originalPrice as number | null) ?? null,
      currency: (q.currency as 'INR' | 'USD') ?? 'INR',
      ratingAvg: (q.ratingAvg as number) ?? 0,
      ratingCount: (q.ratingCount as number) ?? 0,
      totalQuestions: (q.totalQuestions as number) ?? 0,
      durationMinutes: (q.durationMinutes as number | null) ?? null,
    };
  });

  return { certifications, courses, practiceTests, quizzes };
}

// ---------------------------------------------------------------------------
// Wishlist actions - folded into this file rather than a separate
// api/wishlist.ts. Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions; this repo was already at exactly 12, and a 13th file failed
// the deployment (build succeeded, "Deploying outputs" step rejected it).
// Wishlist and cart are the same conceptual domain anyway (a student's
// saved-item list, same shape/never-trust-stored-price reasoning), so this
// is a natural consolidation, not just a workaround. Reuses this file's own
// getAdminApp/db/Err/requireStudent/ItemType/collectionFor - no duplication
// needed within one file, unlike the no-shared-code rule across files.
// ---------------------------------------------------------------------------

interface HydratedWishlistItem {
  itemType: ItemType;
  itemId: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: Currency;
  ratingAvg: number;
  ratingCount: number;
  totalQuestions: number;
  // Quiz cards show one overall duration; practice-test cards show a
  // per-session duration - same field on the wire either way so the
  // frontend card can render it without knowing which item type it got.
  // null for a practice test whose admin left session length up to the
  // student (see PracticeTestDoc's durationPerSessionMinutes).
  durationMinutes: number | null;
}

// Mirrors hydrateCart above: never trust the stored list as a price/title
// source, and silently drop anything deleted or already purchased since
// being wishlisted. Unlike the cart, a free item is never dropped just for
// being free - there's no checkout constraint here, so wishlisting
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
      skillLevel: data.skillLevel ?? 'Foundation',
      price: data.price ?? 0,
      originalPrice: data.originalPrice ?? null,
      currency: data.currency ?? 'INR',
      ratingAvg: data.ratingAvg ?? 0,
      ratingCount: data.ratingCount ?? 0,
      totalQuestions: data.totalQuestions ?? 0,
      durationMinutes: entry.itemType === 'quiz' ? data.durationMinutes ?? 0 : data.durationPerSessionMinutes ?? null,
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

// Wishlist deliberately never supports 'package' (out of scope this
// phase - see PackageDoc's own comment) - its own narrower schema instead
// of reusing addItemSchema, since hydrateWishlist reads `title` off the
// item doc and a PackageDoc has no such field (it's `name`). A CourseDoc
// does have `title`, so it's fine to include here.
const wishlistItemSchema = z.object({ itemType: z.enum(['quiz', 'practiceTest', 'course']), itemId: z.string().min(1) });

async function addWishlistItem(uid: string, body: unknown) {
  const parsed = wishlistItemSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { itemType, itemId } = parsed.data;

  const itemSnap = await db.collection(collectionFor(itemType)).doc(itemId).get();
  if (!itemSnap.exists) throw Err.notFound('Item not found');

  const ref = db.collection('wishlists').doc(uid);
  const snap = await ref.get();
  const existing = (snap.exists ? snap.data()!.items : []) as { itemType: ItemType; itemId: string }[];
  if (existing.some((e) => e.itemType === itemType && e.itemId === itemId)) {
    return getWishlist(uid); // already wishlisted - no-op, not an error
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

async function removeWishlistItem(uid: string, body: unknown) {
  const parsed = wishlistItemSchema.safeParse(body);
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

    // The only unauthenticated action - runs before requireStudent so the
    // logged-out landing page / public /search can call it with no token.
    if (action === 'getPublicCatalog') {
      res.status(200).json(await getPublicCatalog());
      return;
    }

    const { uid } = await requireStudent(req);

    switch (action) {
      case 'getCart':
        res.status(200).json(await getCart(uid));
        return;
      case 'addItem':
        res.status(200).json(await addItem(uid, data));
        return;
      case 'removeItem':
        res.status(200).json(await removeItem(uid, data));
        return;
      case 'applyCoupon':
        res.status(200).json(await applyCoupon(uid, data));
        return;
      case 'removeCoupon':
        res.status(200).json(await removeCoupon(uid));
        return;
      case 'listMyPurchases':
        res.status(200).json(await listMyPurchases(uid));
        return;
      case 'getLearnerCatalog':
        res.status(200).json(await getLearnerCatalog(uid));
        return;
      case 'getWishlist':
        res.status(200).json(await getWishlist(uid));
        return;
      case 'addWishlistItem':
        res.status(200).json(await addWishlistItem(uid, data));
        return;
      case 'removeWishlistItem':
        res.status(200).json(await removeWishlistItem(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('cart handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
