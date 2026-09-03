#!/usr/bin/env node
// Seeds the HelpCertify pilot commission policy (20% of net revenue,
// first-purchase only) and points products/HELPCERTIFY at it. Inert until
// the partnerFramework flags are turned on. Idempotent - re-running only
// refreshes the product pointer, never adds a second version.
//
// Run from frontend/:  node scripts/seed-partner-commission-policy.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = rawValue.replace(/^"(.*)"$/, '$1');
  }
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_ADMIN_* env vars - check frontend/.env.local');
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const POLICY_ID = 'hc_default';
const now = Timestamp.now();

const policyRef = db.collection('commissionPolicies').doc(POLICY_ID);
const policySnap = await policyRef.get();

if (!policySnap.exists) {
  await policyRef.set({
    productId: 'HELPCERTIFY',
    name: 'HelpCertify pilot 20%',
    activeVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  await policyRef.collection('versions').doc('1').set({
    version: 1,
    ruleType: 'percent',
    rateBasisPoints: 2000, // 20%
    fixedAmountMinor: null,
    tiers: null,
    maxCommissionMinor: null,
    firstPurchaseOnly: true,
    createdBy: 'seed-script',
    createdAt: now,
  });
  console.log(`Created commissionPolicies/${POLICY_ID} + versions/1 (20%).`);
} else {
  console.log(`commissionPolicies/${POLICY_ID} already exists - leaving it as is.`);
}

const productRef = db.collection('products').doc('HELPCERTIFY');
const productSnap = await productRef.get();
await productRef.set(
  {
    name: productSnap.exists ? productSnap.data().name : 'HelpCertify',
    status: productSnap.exists ? (productSnap.data().status ?? 'ACTIVE') : 'ACTIVE',
    baseUrl: productSnap.exists ? (productSnap.data().baseUrl ?? 'https://helpcertify.com') : 'https://helpcertify.com',
    currency: productSnap.exists ? (productSnap.data().currency ?? 'INR') : 'INR',
    defaultAttributionDays: productSnap.exists ? (productSnap.data().defaultAttributionDays ?? 30) : 30,
    defaultHoldDays: productSnap.exists ? (productSnap.data().defaultHoldDays ?? 7) : 7,
    defaultCommissionPolicyId: POLICY_ID,
    allowReferralCode: true,
    allowLeadRegistration: false,
    createdAt: productSnap.exists ? (productSnap.data().createdAt ?? now) : now,
    updatedAt: now,
  },
  { merge: true },
);
console.log('Set products/HELPCERTIFY.defaultCommissionPolicyId =', POLICY_ID);

await db.collection('auditEvents').add({
  entityType: 'commissionPolicy',
  entityId: POLICY_ID,
  action: 'seed',
  actorId: 'seed-script',
  actorType: 'system',
  before: null,
  after: { rateBasisPoints: 2000, firstPurchaseOnly: true },
  reason: 'Pilot policy seeded',
  correlationId: null,
  createdAt: FieldValue.serverTimestamp(),
});

console.log('Done.');
process.exit(0);
