import { describe, it, expect } from 'vitest';
import { hasFeatureAccess, type FeatureAccessConfig } from './featureAccess';

const baseConfig: FeatureAccessConfig = {
  roles: { admin: true, trainer: true, creator: true, salesPartner: false },
  allowUserIds: [],
  denyUserIds: [],
};

describe('hasFeatureAccess', () => {
  it('grants a user whose capability key is enabled', () => {
    expect(hasFeatureAccess({ uid: 'u1', capabilityKeys: ['admin'] }, baseConfig)).toBe(true);
    expect(hasFeatureAccess({ uid: 'u2', capabilityKeys: ['trainer'] }, baseConfig)).toBe(true);
    expect(hasFeatureAccess({ uid: 'u3', capabilityKeys: ['creator'] }, baseConfig)).toBe(true);
  });

  it('denies a user whose only capability key is disabled', () => {
    expect(hasFeatureAccess({ uid: 'u4', capabilityKeys: ['salesPartner'] }, baseConfig)).toBe(false);
  });

  it('denies a plain student with no matching capability', () => {
    expect(hasFeatureAccess({ uid: 'u5', capabilityKeys: [] }, baseConfig)).toBe(false);
  });

  it('grants a user via a custom category key once it is enabled', () => {
    const config: FeatureAccessConfig = { ...baseConfig, roles: { ...baseConfig.roles, vip_reseller: true } };
    expect(hasFeatureAccess({ uid: 'u6', capabilityKeys: ['vip_reseller'] }, config)).toBe(true);
  });

  it('denies a custom category key that is not present in roles at all', () => {
    expect(hasFeatureAccess({ uid: 'u7', capabilityKeys: ['brand_new_category'] }, baseConfig)).toBe(false);
  });

  it('grants a specific allowed user ID even with every capability disabled', () => {
    const config: FeatureAccessConfig = {
      roles: { admin: false, trainer: false, creator: false, salesPartner: false },
      allowUserIds: ['u8'],
      denyUserIds: [],
    };
    expect(hasFeatureAccess({ uid: 'u8', capabilityKeys: [] }, config)).toBe(true);
  });

  it('denies a specific denied user ID even though their capability is enabled', () => {
    const config: FeatureAccessConfig = { ...baseConfig, denyUserIds: ['u9'] };
    expect(hasFeatureAccess({ uid: 'u9', capabilityKeys: ['admin'] }, config)).toBe(false);
  });

  it('deny list wins over an allow list entry for the same user', () => {
    const config: FeatureAccessConfig = { ...baseConfig, allowUserIds: ['u10'], denyUserIds: ['u10'] };
    expect(hasFeatureAccess({ uid: 'u10', capabilityKeys: [] }, config)).toBe(false);
  });
});
