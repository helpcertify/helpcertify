#!/usr/bin/env node
// Read-only audit of the certifications collection - used to spot duplicate
// / test-data certification records before deleting the extras. Prints one
// row per certification: id, name, slug, status, createdAt, package count,
// included practice/mock bank ids, and how many purchases + practiceProgress
// docs reference those banks (i.e. real learner footprint).
//
// Run from frontend/:
//   node scripts/inspect-certs.mjs           # all certifications
//   node scripts/inspect-certs.mjs CISM      # name filter (case-insensitive substring)

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

const filter = (process.argv[2] ?? '').toLowerCase();

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_ADMIN_* env vars - check .env.local');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

const certsSnap = await db.collection('certifications').get();
const rows = [];

for (const doc of certsSnap.docs) {
  const d = doc.data();
  const name = d.name ?? d.shortName ?? '(unnamed)';
  if (filter && !name.toLowerCase().includes(filter)) continue;

  const pkgsSnap = await db.collection('packages').where('certificationId', '==', doc.id).get();
  const practiceIds = new Set();
  const quizIds = new Set();
  for (const p of pkgsSnap.docs) {
    for (const id of p.data().includedPracticeTestIds ?? []) practiceIds.add(id);
    for (const id of p.data().includedQuizIds ?? []) quizIds.add(id);
  }

  let purchaseCount = 0;
  let progressCount = 0;
  for (const id of practiceIds) {
    purchaseCount += (await db.collection('purchases').where('itemType', '==', 'practiceTest').where('itemId', '==', id).count().get()).data().count;
    progressCount += (await db.collection('practiceProgress').where('testId', '==', id).count().get()).data().count;
  }
  for (const id of quizIds) {
    purchaseCount += (await db.collection('purchases').where('itemType', '==', 'quiz').where('itemId', '==', id).count().get()).data().count;
  }

  rows.push({
    id: doc.id,
    name,
    slug: d.slug ?? '',
    status: d.status ?? (d.isPublished ? 'published?' : 'draft?'),
    created: d.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) ?? '?',
    packages: pkgsSnap.size,
    practiceBanks: practiceIds.size,
    mockBanks: quizIds.size,
    purchases: purchaseCount,
    progressDocs: progressCount,
  });
}

rows.sort((a, b) => a.name.localeCompare(b.name) || a.created.localeCompare(b.created));
console.table(rows);
console.log(`\n${rows.length} certification(s)${filter ? ` matching "${filter}"` : ''}.`);
console.log('Safe to delete = 0 purchases AND 0 progressDocs. Keep the one with real footprint (or the oldest).');
process.exit(0);
