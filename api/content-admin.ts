import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type WriteBatch, type DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import JSZip from 'jszip';
import { randomBytes } from 'crypto';

// Quiz + practice-test content management (create/update/delete/list, both
// docx-format parsers, answer-key preview) for the v2 platform. Self-contained
// — see api/auth.ts's header comment for why (no shared code across
// api/*.ts). A quiz/practice-test upload can run to ~1,500 questions (the
// real CISM banks this app was built against), so this gets the highest
// maxDuration the Hobby plan allows, same reasoning as the old
// admin-uploads.ts (functions/src/_migrated-v1-reference).
export const config = { maxDuration: 60 };

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin service account env vars are not configured');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const adminAuth = getAuth(getAdminApp());
const db = getFirestore(getAdminApp());
db.settings({ ignoreUndefinedProperties: true });

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
const Err = {
  unauthenticated: (m = 'Authentication required') => new HttpError(401, m),
  permissionDenied: (m = 'You do not have permission to perform this action') => new HttpError(403, m),
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
};

async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  // Role comes from the Firestore users/{uid} doc, not an ID-token custom
  // claim — see api/admin.ts's requireAdmin for why.
  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  if (user.role !== 'admin') throw Err.permissionDenied();

  return { uid: decoded.uid };
}

async function writeAdminLog(args: {
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
}) {
  await db.collection('adminLogs').add({
    performedBy: args.performedBy,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    description: args.description,
    severity: 'info' as const,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Docx parsing — two formats, each returning the same shape.
// ---------------------------------------------------------------------------

interface ParsedOption {
  id: string;
  text: string;
}
interface ParsedQuestion {
  order: number;
  questionText: string;
  options: ParsedOption[];
  correctOptionId: string;
}
interface ParseError {
  line: number;
  message: string;
  rawText: string;
}
interface ParseResult {
  valid: ParsedQuestion[];
  errors: ParseError[];
}

interface Paragraph {
  text: string;
  bold: boolean;
  highlighted: boolean;
}

async function extractParagraphs(fileBuffer: Buffer): Promise<Paragraph[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) throw Err.invalidArgument('Not a valid .docx — missing word/document.xml');
  const documentXml = await documentXmlFile.async('text');

  const paraMatches = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paraMatches.map((p) => {
    const textMatches = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const text = textMatches
      .map((m) => m[1])
      .join('')
      .trim();
    return { text, bold: p.includes('<w:b/>'), highlighted: p.includes('<w:highlight') };
  });
}

// CISA Q&A format — reuses the logic already validated in production against
// ~1,500 real CISM questions (see functions/src/_migrated-v1-reference's
// docxParser.ts, one level up in the repo, under admin/):
//   N. <bold question stem>
//   A. option
//   B. option
//   C. option
//   D. option
//   [Answer: X]        <- optional; a highlighted option is the fallback
const CISA_QUESTION_RE = /^(\d+)\.\s+(.*)$/;
const CISA_OPTION_RE = /^([A-F])[.)]\s+(.*)$/;
const CISA_ANSWER_RE = /^Answer:\s*([A-F])/i;

async function parseCisaQaFormat(fileBuffer: Buffer): Promise<ParseResult> {
  const paragraphs = await extractParagraphs(fileBuffer);
  const valid: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let num = 0;
  let stem = '';
  let options: { letter: string; text: string; highlighted: boolean }[] = [];
  let answerLetter: string | null = null;
  let order = 0;

  const finalize = () => {
    if (num === 0) return;
    if (options.length < 2) {
      errors.push({ line: num, message: 'Fewer than 2 options found', rawText: stem });
    } else {
      const highlightedLetters = options.filter((o) => o.highlighted).map((o) => o.letter);
      const correctLetter = answerLetter ?? (highlightedLetters.length === 1 ? highlightedLetters[0] : null);
      if (!correctLetter || !options.some((o) => o.letter === correctLetter)) {
        errors.push({ line: num, message: 'Could not determine the correct answer', rawText: stem });
      } else {
        order += 1;
        valid.push({
          order,
          questionText: stem,
          options: options.map((o) => ({ id: o.letter, text: o.text })),
          correctOptionId: correctLetter,
        });
      }
    }
    options = [];
    answerLetter = null;
  };

  for (const para of paragraphs) {
    if (!para.text) continue;
    const qMatch = para.bold ? CISA_QUESTION_RE.exec(para.text) : null;
    if (qMatch) {
      finalize();
      num = Number(qMatch[1]);
      stem = qMatch[2];
      continue;
    }
    if (num === 0) continue;

    const oMatch = CISA_OPTION_RE.exec(para.text);
    if (oMatch) {
      options.push({ letter: oMatch[1], text: oMatch[2], highlighted: para.highlighted });
      continue;
    }
    const aMatch = CISA_ANSWER_RE.exec(para.text);
    if (aMatch) answerLetter = aMatch[1].toUpperCase();
  }
  finalize();

  return { valid, errors };
}

// Standard Template format — this app's own simpler convention (no
// reference example existed for this one, unlike CISA Q&A):
//   Q: <question text>
//   A) option
//   B) option
//   C) option
//   D) option
//   Correct: B
const STD_QUESTION_RE = /^Q:\s*(.*)$/i;
const STD_OPTION_RE = /^([A-F])\)\s*(.*)$/;
const STD_ANSWER_RE = /^Correct:\s*([A-F])/i;

async function parseStandardTemplateFormat(fileBuffer: Buffer): Promise<ParseResult> {
  const paragraphs = await extractParagraphs(fileBuffer);
  const valid: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let questionNum = 0;
  let stem = '';
  let options: { letter: string; text: string }[] = [];
  let answerLetter: string | null = null;
  let order = 0;
  let active = false;

  const finalize = () => {
    if (!active) return;
    if (options.length < 2) {
      errors.push({ line: questionNum, message: 'Fewer than 2 options found', rawText: stem });
    } else if (!answerLetter || !options.some((o) => o.letter === answerLetter)) {
      errors.push({ line: questionNum, message: 'Missing or invalid "Correct:" line', rawText: stem });
    } else {
      order += 1;
      valid.push({
        order,
        questionText: stem,
        options: options.map((o) => ({ id: o.letter, text: o.text })),
        correctOptionId: answerLetter,
      });
    }
    options = [];
    answerLetter = null;
  };

  for (const para of paragraphs) {
    if (!para.text) continue;
    const qMatch = STD_QUESTION_RE.exec(para.text);
    if (qMatch) {
      finalize();
      questionNum += 1;
      active = true;
      stem = qMatch[1];
      continue;
    }
    if (!active) continue;

    const oMatch = STD_OPTION_RE.exec(para.text);
    if (oMatch) {
      options.push({ letter: oMatch[1], text: oMatch[2] });
      continue;
    }
    const aMatch = STD_ANSWER_RE.exec(para.text);
    if (aMatch) answerLetter = aMatch[1].toUpperCase();
  }
  finalize();

  return { valid, errors };
}

async function fetchAndParse(fileUrl: string, sourceFormat: 'standard' | 'cisa_qa'): Promise<ParseResult> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(fileUrl, blobToken ? { headers: { Authorization: `Bearer ${blobToken}` } } : undefined);
  if (!res.ok) throw Err.invalidArgument('Could not download the uploaded file');
  const buffer = Buffer.from(await res.arrayBuffer());

  return sourceFormat === 'cisa_qa' ? parseCisaQaFormat(buffer) : parseStandardTemplateFormat(buffer);
}

async function writeQuestionsBatch(parentRef: DocumentReference, questions: ParsedQuestion[]): Promise<void> {
  for (const group of chunk(questions, 400)) {
    const batch: WriteBatch = db.batch();
    for (const q of group) {
      const qRef = parentRef.collection('questions').doc();
      batch.set(qRef, { order: q.order, questionText: q.questionText, options: q.options });
      batch.set(qRef.collection('private').doc('answerKey'), { correctOptionId: q.correctOptionId });
    }
    await batch.commit();
  }
}

async function deleteSubcollection(parentRef: DocumentReference, name: string): Promise<void> {
  const snap = await parentRef.collection(name).get();
  for (const group of chunk(snap.docs, 400)) {
    const batch = db.batch();
    for (const doc of group) {
      const privateSnap = await doc.ref.collection('private').get();
      privateSnap.docs.forEach((p) => batch.delete(p.ref));
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// Quiz actions
// ---------------------------------------------------------------------------

// price/originalPrice arrive from the admin form already converted to paise
// (the form itself takes whole rupees for readability) — both optional so
// existing create/update call sites without pricing keep working unchanged.
const createQuizSchema = z.object({
  title: z.string().trim().min(2).max(200),
  sourceFormat: z.enum(['standard', 'cisa_qa']),
  fileUrl: z.string().url(),
  durationType: z.enum(['overall', 'per_question']),
  durationMinutes: z.number().int().min(1).max(600),
  enforceSequentialNav: z.boolean().default(false),
  showImmediateResult: z.boolean().default(false),
  showFinalScore: z.boolean().default(true),
  scheduledStart: z.string().datetime().optional(),
  blockAltTab: z.boolean().default(true),
  price: z.number().int().min(0).default(0),
  originalPrice: z.number().int().min(0).nullable().optional(),
});

async function createQuiz(uid: string, body: unknown) {
  const parsed = createQuizSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const { valid, errors } = await fetchAndParse(d.fileUrl, d.sourceFormat);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const quizRef = db.collection('quizzes').doc();
  await quizRef.set({
    title: d.title,
    code: generateCode(),
    sourceFormat: d.sourceFormat,
    totalQuestions: valid.length,
    enforceSequentialNav: d.enforceSequentialNav,
    showImmediateResult: d.showImmediateResult,
    showFinalScore: d.showFinalScore,
    durationType: d.durationType,
    durationMinutes: d.durationMinutes,
    scheduledStart: d.scheduledStart ? Timestamp.fromDate(new Date(d.scheduledStart)) : null,
    isPublished: true,
    antiCheat: { blockAltTab: d.blockAltTab },
    price: d.price,
    originalPrice: d.originalPrice ?? null,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await writeQuestionsBatch(quizRef, valid);
  await writeAdminLog({
    performedBy: uid,
    action: 'createQuiz',
    targetType: 'quiz',
    targetId: quizRef.id,
    description: `Published quiz "${d.title}" (${valid.length} questions)`,
  });

  return { quizId: quizRef.id, totalQuestions: valid.length, parseErrors: errors };
}

const updateQuizSchema = z.object({
  quizId: z.string().min(1),
  title: z.string().trim().min(2).max(200).optional(),
  durationType: z.enum(['overall', 'per_question']).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  enforceSequentialNav: z.boolean().optional(),
  showImmediateResult: z.boolean().optional(),
  showFinalScore: z.boolean().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  blockAltTab: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  price: z.number().int().min(0).optional(),
  originalPrice: z.number().int().min(0).nullable().optional(),
});

async function updateQuiz(uid: string, body: unknown) {
  const parsed = updateQuizSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId, scheduledStart, blockAltTab, ...rest } = parsed.data;

  const ref = db.collection('quizzes').doc(quizId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Quiz not found');

  const update: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
  if (scheduledStart !== undefined) update.scheduledStart = scheduledStart ? Timestamp.fromDate(new Date(scheduledStart)) : null;
  if (blockAltTab !== undefined) update.antiCheat = { blockAltTab };

  await ref.update(update);
  await writeAdminLog({
    performedBy: uid,
    action: 'updateQuiz',
    targetType: 'quiz',
    targetId: quizId,
    description: `Updated quiz "${snap.data()?.title}"`,
  });
  return { success: true };
}

const quizIdSchema = z.object({ quizId: z.string().min(1) });

async function deleteQuiz(uid: string, body: unknown) {
  const parsed = quizIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('quizzes').doc(parsed.data.quizId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Quiz not found');

  await deleteSubcollection(ref, 'questions');
  await ref.delete();
  await writeAdminLog({
    performedBy: uid,
    action: 'deleteQuiz',
    targetType: 'quiz',
    targetId: parsed.data.quizId,
    description: `Deleted quiz "${snap.data()?.title}"`,
  });
  return { success: true };
}

async function listQuizzesAdmin() {
  const snap = await db.collection('quizzes').orderBy('createdAt', 'desc').get();
  return { quizzes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function getQuizAnswerKey(body: unknown) {
  const parsed = quizIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('quizzes').doc(parsed.data.quizId);
  const [quizSnap, questionsSnap] = await Promise.all([ref.get(), ref.collection('questions').orderBy('order').get()]);
  if (!quizSnap.exists) throw Err.notFound('Quiz not found');

  const keySnaps = await db.getAll(...questionsSnap.docs.map((d) => d.ref.collection('private').doc('answerKey')));
  const keyByQuestionId = new Map(keySnaps.map((s) => [s.ref.parent.parent!.id, s.data()]));

  return {
    quiz: { id: quizSnap.id, ...quizSnap.data() },
    questions: questionsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      correctOptionId: keyByQuestionId.get(d.id)?.correctOptionId ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Practice test actions
// ---------------------------------------------------------------------------

const createPracticeTestSchema = z.object({
  title: z.string().trim().min(2).max(200),
  sourceFormat: z.enum(['standard', 'cisa_qa']),
  fileUrl: z.string().url(),
  availableFrom: z.string().datetime(),
  availableUntil: z.string().datetime(),
  durationPerSessionMinutes: z.number().int().min(1).max(600),
  defaultInitialBatchSize: z.number().int().min(1).max(500),
  price: z.number().int().min(0).default(0),
  originalPrice: z.number().int().min(0).nullable().optional(),
});

async function createPracticeTest(uid: string, body: unknown) {
  const parsed = createPracticeTestSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const { valid, errors } = await fetchAndParse(d.fileUrl, d.sourceFormat);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const testRef = db.collection('practiceTests').doc();
  await testRef.set({
    title: d.title,
    availableFrom: Timestamp.fromDate(new Date(d.availableFrom)),
    availableUntil: Timestamp.fromDate(new Date(d.availableUntil)),
    durationPerSessionMinutes: d.durationPerSessionMinutes,
    defaultInitialBatchSize: d.defaultInitialBatchSize,
    sourceFormat: d.sourceFormat,
    totalQuestions: valid.length,
    price: d.price,
    originalPrice: d.originalPrice ?? null,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await writeQuestionsBatch(testRef, valid);
  await writeAdminLog({
    performedBy: uid,
    action: 'createPracticeTest',
    targetType: 'practiceTest',
    targetId: testRef.id,
    description: `Created practice test "${d.title}" (${valid.length} questions)`,
  });

  return { testId: testRef.id, totalQuestions: valid.length, parseErrors: errors };
}

const updatePracticeTestSchema = z.object({
  testId: z.string().min(1),
  title: z.string().trim().min(2).max(200).optional(),
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  durationPerSessionMinutes: z.number().int().min(1).max(600).optional(),
  defaultInitialBatchSize: z.number().int().min(1).max(500).optional(),
  price: z.number().int().min(0).optional(),
  originalPrice: z.number().int().min(0).nullable().optional(),
});

async function updatePracticeTest(uid: string, body: unknown) {
  const parsed = updatePracticeTestSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, availableFrom, availableUntil, ...rest } = parsed.data;

  const ref = db.collection('practiceTests').doc(testId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Practice test not found');

  const update: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
  if (availableFrom) update.availableFrom = Timestamp.fromDate(new Date(availableFrom));
  if (availableUntil) update.availableUntil = Timestamp.fromDate(new Date(availableUntil));

  await ref.update(update);
  await writeAdminLog({
    performedBy: uid,
    action: 'updatePracticeTest',
    targetType: 'practiceTest',
    targetId: testId,
    description: `Updated practice test "${snap.data()?.title}"`,
  });
  return { success: true };
}

const testIdSchema = z.object({ testId: z.string().min(1) });

async function deletePracticeTest(uid: string, body: unknown) {
  const parsed = testIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('practiceTests').doc(parsed.data.testId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Practice test not found');

  await deleteSubcollection(ref, 'questions');
  await ref.delete();
  await writeAdminLog({
    performedBy: uid,
    action: 'deletePracticeTest',
    targetType: 'practiceTest',
    targetId: parsed.data.testId,
    description: `Deleted practice test "${snap.data()?.title}"`,
  });
  return { success: true };
}

async function listPracticeTestsAdmin() {
  const snap = await db.collection('practiceTests').orderBy('createdAt', 'desc').get();
  return { practiceTests: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function getPracticeTestAnswerKey(body: unknown) {
  const parsed = testIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('practiceTests').doc(parsed.data.testId);
  const [testSnap, questionsSnap] = await Promise.all([ref.get(), ref.collection('questions').orderBy('order').get()]);
  if (!testSnap.exists) throw Err.notFound('Practice test not found');

  const keySnaps = await db.getAll(...questionsSnap.docs.map((d) => d.ref.collection('private').doc('answerKey')));
  const keyByQuestionId = new Map(keySnaps.map((s) => [s.ref.parent.parent!.id, s.data()]));

  return {
    practiceTest: { id: testSnap.id, ...testSnap.data() },
    questions: questionsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      correctOptionId: keyByQuestionId.get(d.id)?.correctOptionId ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireAdmin(req);

    switch (action) {
      case 'createQuiz':
        res.status(200).json(await createQuiz(uid, data));
        return;
      case 'updateQuiz':
        res.status(200).json(await updateQuiz(uid, data));
        return;
      case 'deleteQuiz':
        res.status(200).json(await deleteQuiz(uid, data));
        return;
      case 'listQuizzesAdmin':
        res.status(200).json(await listQuizzesAdmin());
        return;
      case 'getQuizAnswerKey':
        res.status(200).json(await getQuizAnswerKey(data));
        return;
      case 'createPracticeTest':
        res.status(200).json(await createPracticeTest(uid, data));
        return;
      case 'updatePracticeTest':
        res.status(200).json(await updatePracticeTest(uid, data));
        return;
      case 'deletePracticeTest':
        res.status(200).json(await deletePracticeTest(uid, data));
        return;
      case 'listPracticeTestsAdmin':
        res.status(200).json(await listPracticeTestsAdmin());
        return;
      case 'getPracticeTestAnswerKey':
        res.status(200).json(await getPracticeTestAnswerKey(data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('content-admin handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
