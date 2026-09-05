// Pure decision logic for the Feature Access gate (see AdminSettingsPage's
// Feature Access card and api/content-admin.ts's hasFeatureAccess, which
// duplicates this exact reasoning inline for its own Firestore-backed
// gating check - no cross-file imports across api/*.ts, per this repo's
// existing convention; this module exists purely so the decision logic
// itself has unit test coverage, same pattern as offerStatus.ts).

export interface FeatureAccessConfig {
  roles: { admin: boolean; trainer: boolean; creator: boolean };
  allowUserIds: string[];
  denyUserIds: string[];
}

export interface FeatureAccessCapabilities {
  uid: string;
  isAdmin: boolean;
  isActiveTrainer: boolean;
  isApprovedCreator: boolean;
}

// Deny wins over everything, then an explicit allow wins over role, so an
// admin can carve out an exception either way without touching the role
// toggle everyone else relies on.
export function hasFeatureAccess(caps: FeatureAccessCapabilities, config: FeatureAccessConfig): boolean {
  if (config.denyUserIds.includes(caps.uid)) return false;
  if (config.allowUserIds.includes(caps.uid)) return true;

  if (caps.isAdmin && config.roles.admin) return true;
  if (caps.isActiveTrainer && config.roles.trainer) return true;
  if (caps.isApprovedCreator && config.roles.creator) return true;

  return false;
}
