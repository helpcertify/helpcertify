import { toDate } from '@/utils/formatDate';

// A purchase row from cartApi.listMyPurchases. Package-sourced purchases can
// carry an expiresAt (purchasedAt + the package's validity window); direct
// single-item purchases have none and are lifetime.
export interface RawPurchase {
  itemType: string;
  itemId: string;
  purchasedAt?: unknown;
  expiresAt?: unknown;
}

// null / absent expiresAt = lifetime. A past expiresAt = access has lapsed.
export function isPurchaseActive(p: { expiresAt?: unknown }): boolean {
  return !p.expiresAt || toDate(p.expiresAt).getTime() >= Date.now();
}

// `${itemType}_${itemId}` keys for every purchase that still grants access.
export function activePurchaseKeys(purchases: RawPurchase[] | undefined): Set<string> {
  return new Set((purchases ?? []).filter(isPurchaseActive).map((p) => `${p.itemType}_${p.itemId}`));
}
