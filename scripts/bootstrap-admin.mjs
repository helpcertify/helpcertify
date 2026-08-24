#!/usr/bin/env node
// Optional convenience script for creating an admin account from the
// command line. Equivalent to doing it by hand in the Firebase Console:
// Authentication tab -> Add user (email + password), then Firestore tab ->
// users/{that uid} -> set role: "admin", isActive: true (create the doc if
// it doesn't exist yet). Role lives only on that Firestore doc — no custom
// claim, no Admin SDK code required either way; this script just does both
// console steps in one command instead.
//
// Run from frontend/:
//   node scripts/bootstrap-admin.mjs "Admin Name" admin@example.com "a-strong-password"
//
// Reads Firebase Admin credentials the same way every api/*.ts function does
// (FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY), loaded here
// from .env.local since this runs outside Vercel's dev server.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env.local');
if (existsSync(envPath)) {
  // A line-by-line KEY=value parser breaks on a multi-line value (e.g. a PEM
  // private key) — `vercel env pull` writes those as real newlines inside
  // the quotes rather than as a single line with escaped `\n`s, and
  // .env.local gets regenerated in that shape any time something re-pulls
  // it (confirmed live: a VS Code Vercel extension did this mid-session).
  // Matching `KEY="...anything, including newlines..."` up to the next
  // literal `"` handles both shapes — a PEM body never contains a `"`.
  const envText = readFileSync(envPath, 'utf8');
  const re = /^([A-Z0-9_]+)="([\s\S]*?)"[ \t]*$/gm;
  let match;
  while ((match = re.exec(envText))) {
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue;
    }
  }
  // Also accept a bare (unquoted) single-line value for vars that don't need quoting.
  for (const line of envText.split('\n')) {
    const bare = /^([A-Z0-9_]+)=([^"].*)$/.exec(line.trim());
    if (!bare) continue;
    const [, key, rawValue] = bare;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue;
    }
  }
}

const [, , name, email, password] = process.argv;
if (!name || !email || !password) {
  console.error('Usage: node scripts/bootstrap-admin.mjs "Admin Name" admin@example.com "password"');
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

let uid;
try {
  const existing = await auth.getUserByEmail(email);
  uid = existing.uid;
  console.log(`Found existing auth account for ${email} (${uid}) — promoting to admin.`);
} catch {
  const created = await auth.createUser({ email, password, displayName: name });
  uid = created.uid;
  console.log(`Created new auth account for ${email} (${uid}).`);
}

const now = FieldValue.serverTimestamp();
await db.collection('users').doc(uid).set(
  {
    name,
    email,
    role: 'admin',
    avatarUrl: null,
    department: null,
    yearOfAdmission: null,
    currentAcademicYear: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  { merge: true }
);

console.log(`\n${email} is now an admin. Sign in via the "Admin Portal" button on the landing page.`);
process.exit(0);
