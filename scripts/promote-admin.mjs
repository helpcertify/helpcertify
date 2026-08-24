#!/usr/bin/env node
// Sets role:'admin' on an EXISTING Firebase Auth user's Firestore doc — for
// when the auth account was already created (e.g. by hand in the Firebase
// Console) and only the Firestore side is missing. Doesn't touch
// Authentication at all, just reads the existing user record for
// name/email and writes/merges the users/{uid} doc.
//
// Run from frontend/:
//   node scripts/promote-admin.mjs <uid>

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

const [, , uid] = process.argv;
if (!uid) {
  console.error('Usage: node scripts/promote-admin.mjs <uid>');
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_ADMIN_* env vars — check frontend/.env.local');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const userRecord = await auth.getUser(uid); // throws if the uid doesn't exist
const now = FieldValue.serverTimestamp();

await db.collection('users').doc(uid).set(
  {
    name: userRecord.displayName ?? userRecord.email?.split('@')[0] ?? 'Admin',
    email: userRecord.email ?? '',
    role: 'admin',
    avatarUrl: userRecord.photoURL ?? null,
    department: null,
    yearOfAdmission: null,
    currentAcademicYear: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  { merge: true }
);

console.log(`${userRecord.email} (${uid}) is now an admin.`);
process.exit(0);
