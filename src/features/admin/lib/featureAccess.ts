// Pure decision logic for the Feature Access gate (see AdminSettingsPage's
// Feature Access card and api/content-admin.ts's hasFeatureAccess, which
// duplicates this exact reasoning inline for its own Firestore-backed
// gating check - no cross-file imports across api/*.ts, per this repo's
// existing convention; this module exists purely so the decision logic
// itself has unit test coverage, same pattern as offerStatus.ts).
//
// `roles` is keyed by category: the four built-ins (admin/trainer/
// creator/salesPartner) plus any admin-created custom userCategories key -
// an open string-keyed map, not a fixed shape, so a new category never
// needs a code change here.

export interface FeatureAccessConfig {
  roles: Record<string, boolean>;
  allowUserIds: string[];
  denyUserIds: string[];
}

export interface FeatureAccessCapabilities {
  uid: string;
  // Every category key this user currently satisfies (e.g.
  // ['trainer', 'my_custom_category']) - the caller resolves this from
  // whatever data source it has (Firestore reads server-side, or an
  // already-fetched user record client-side), this module just decides.
  capabilityKeys: string[];
}

// Deny wins over everything, then an explicit allow wins over category, so
// an admin can carve out an exception either way without touching the
// category toggle everyone else relies on.
export function hasFeatureAccess(caps: FeatureAccessCapabilities, config: FeatureAccessConfig): boolean {
  if (config.denyUserIds.includes(caps.uid)) return false;
  if (config.allowUserIds.includes(caps.uid)) return true;

  return caps.capabilityKeys.some((key) => config.roles[key] === true);
}
