import { describe, it, expect } from 'vitest';
import { hasFeatureAccess, type FeatureAccessConfig } from './featureAccess';

const baseConfig: FeatureAccessConfig = {
  roles: { admin: true, trainer: true, creator: true },
  allowUserIds: [],
  denyUserIds: [],
};

describe('hasFeatureAccess', () => {
  it('grants an admin when the admin role is enabled', () => {
    expect(hasFeatureAccess({ uid: 'u1', isAdmin: true, isActiveTrainer: false, isApprovedCreator: false }, baseConfig)).toBe(true);
  });

  it('denies an admin when the admin role is disabled', () => {
    const config = { ...baseConfig, roles: { ...baseConfig.roles, admin: false } };
    expect(hasFeatureAccess({ uid: 'u1', isAdmin: true, isActiveTrainer: false, isApprovedCreator: false }, config)).toBe(false);
  });

  it('grants an active trainer when the trainer role is enabled', () => {
    expect(hasFeatureAccess({ uid: 'u2', isAdmin: false, isActiveTrainer: true, isApprovedCreator: false }, baseConfig)).toBe(true);
  });

  it('grants an approved creator when the creator role is enabled', () => {
    expect(hasFeatureAccess({ uid: 'u3', isAdmin: false, isActiveTrainer: false, isApprovedCreator: true }, baseConfig)).toBe(true);
  });

  it('denies a plain student with no matching capability', () => {
    expect(hasFeatureAccess({ uid: 'u4', isAdmin: false, isActiveTrainer: false, isApprovedCreator: false }, baseConfig)).toBe(false);
  });

  it('grants a specific allowed user ID even with every role disabled', () => {
    const config: FeatureAccessConfig = {
      roles: { admin: false, trainer: false, creator: false },
      allowUserIds: ['u5'],
      denyUserIds: [],
    };
    expect(hasFeatureAccess({ uid: 'u5', isAdmin: false, isActiveTrainer: false, isApprovedCreator: false }, config)).toBe(true);
  });

  it('denies a specific denied user ID even though their role is enabled', () => {
    const config: FeatureAccessConfig = { ...baseConfig, denyUserIds: ['u6'] };
    expect(hasFeatureAccess({ uid: 'u6', isAdmin: true, isActiveTrainer: false, isApprovedCreator: false }, config)).toBe(false);
  });

  it('deny list wins over an allow list entry for the same user', () => {
    const config: FeatureAccessConfig = { ...baseConfig, allowUserIds: ['u7'], denyUserIds: ['u7'] };
    expect(hasFeatureAccess({ uid: 'u7', isAdmin: false, isActiveTrainer: false, isApprovedCreator: false }, config)).toBe(false);
  });
});
