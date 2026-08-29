// Pure offer-status computation — no cron/scheduled job exists in this
// app (see referralRules.ts's own computeCreditStatus for the same
// established pattern), so an offer's Scheduled/Active/Expired state is
// derived lazily from timestamps wherever it's read, never trusted from a
// stored value. api/content-admin.ts duplicates this same short logic
// inline for its own read actions (no cross-file imports across
// api/*.ts, per this repo's existing convention).

export type OfferStatus = 'none' | 'scheduled' | 'active' | 'expired' | 'cancelled';

export interface OfferFields {
  offerPrice: number | null;
  offerStart: Date | null;
  offerEnd: Date | null;
  offerCancelledAt: Date | null;
}

export function computeOfferStatus(offer: OfferFields, now: Date): OfferStatus {
  if (offer.offerPrice === null || !offer.offerStart || !offer.offerEnd) return 'none';
  if (offer.offerCancelledAt) return 'cancelled';
  if (now.getTime() < offer.offerStart.getTime()) return 'scheduled';
  if (now.getTime() > offer.offerEnd.getTime()) return 'expired';
  return 'active';
}

// The price a learner would actually pay right now — the offer price only
// while it's genuinely Active, the regular selling price otherwise. Not
// wired into api/checkout.ts this phase (see PackageDoc's own comment) —
// used only by the admin preview and this module's own tests.
export function effectivePrice(pkg: OfferFields & { sellingPrice: number }, now: Date): number {
  return computeOfferStatus(pkg, now) === 'active' ? pkg.offerPrice! : pkg.sellingPrice;
}

// Two offer windows on the *same* package overlap if either window's start
// falls strictly inside the other's [start, end) span — used to block a
// second scheduled offer from silently colliding with one still pending or
// active on the same package.
export function offersOverlap(a: { offerStart: Date; offerEnd: Date }, b: { offerStart: Date; offerEnd: Date }): boolean {
  return a.offerStart.getTime() < b.offerEnd.getTime() && b.offerStart.getTime() < a.offerEnd.getTime();
}
