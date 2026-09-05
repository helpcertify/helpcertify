import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type WriteBatch, type DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import JSZip from 'jszip';
import { randomBytes } from 'crypto';

// category is validated as any non-empty string (not a fixed enum) - the
// admin create forms let an admin type a custom certification body/vendor
// beyond src/types/models.ts's CERTIFICATION_CATEGORIES list (see
// CategorySelect.tsx), so this file no longer needs its own duplicate of
// that list the way it used to.

// Duplicated from src/types/models.ts's SKILL_LEVELS - same reasoning.
const SKILL_LEVELS = ['Foundation', 'Associate', 'Expert'] as const;

// Quiz + practice-test content management (create/update/delete/list, both
// docx-format parsers, answer-key preview) for the v2 platform. Self-contained
// - see api/auth.ts's header comment for why (no shared code across
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
  failedPrecondition: (m: string) => new HttpError(409, m),
};

// Verifies the caller is a real, active, signed-in user - no role check.
// requireAdmin (below) is this plus a role check, used by every action in
// this file except the Custom Exam Builder ones (createCustomExamSet /
// listMyCustomExamSets / getCustomExamSetForTaking / submitCustomExamAttempt
// / deleteMyCustomExamSet), which are deliberately reachable by any signed-in
// student - they gate on that student owning a
// purchases/{uid}_customExamBuilder_capability entitlement instead of a role.
async function verifyAuthedUser(req: VercelRequest): Promise<{ uid: string; role: string | undefined }> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');

  return { uid: decoded.uid, role: user.role };
}

async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const { uid, role } = await verifyAuthedUser(req);
  // Role comes from the Firestore users/{uid} doc, not an ID-token custom
  // claim - see api/admin.ts's requireAdmin for why.
  if (role !== 'admin') throw Err.permissionDenied();
  return { uid };
}

async function writeAdminLog(args: {
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  // Products & Pricing audit trail (item 19) - optional so every existing
  // call site (which never set these) keeps compiling and working exactly
  // as before.
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}) {
  await db.collection('adminLogs').add({
    performedBy: args.performedBy,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    description: args.description,
    severity: 'info' as const,
    createdAt: FieldValue.serverTimestamp(),
    ...(args.previousValue !== undefined ? { previousValue: args.previousValue } : {}),
    ...(args.newValue !== undefined ? { newValue: args.newValue } : {}),
    ...(args.reason !== undefined ? { reason: args.reason } : {}),
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Docx parsing - two formats, each returning the same shape.
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
  // Document-level notes distinct from per-question errors - e.g. the
  // source file's own numbering being inconsistent (duplicate/missing
  // question numbers). Not a reason to reject anything: the question text
  // itself may be perfectly fine, it's the label that's off, which an
  // admin can only fix by looking at the original file.
  warnings: string[];
}

interface Paragraph {
  text: string;
  highlighted: boolean;
}

async function extractParagraphs(fileBuffer: Buffer): Promise<Paragraph[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) throw Err.invalidArgument('Not a valid .docx: missing word/document.xml');
  const documentXml = await documentXmlFile.async('text');

  const paraMatches = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paraMatches.map((p) => {
    const textMatches = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const text = textMatches
      .map((m) => m[1])
      .join('')
      .trim();
    return { text, highlighted: p.includes('<w:highlight') };
  });
}

// CISA Q&A format - reuses the logic already validated in production against
// ~1,500 real CISM questions (see functions/src/_migrated-v1-reference's
// docxParser.ts, one level up in the repo, under admin/):
//   N. <question stem>
//   A. option
//   B. option
//   C. option
//   D. option
//   [Answer: X]        <- optional; a highlighted option is the fallback
//
// The question line used to also require para.bold - confirmed live this
// silently rejected an entire real 832-question CISA file (uploaded
// "CISA Question Bank Updated 17th Nov 25 - QandA.docx") whose question
// stems aren't bold at all, just plainly numbered "N. ..." text. The N./
// A-F./Answer: shape is already specific enough to identify a question
// without also demanding bold, so that gate is dropped; parsing the same
// file with it removed (and nothing else changed) now yields 832 valid
// questions and only 2 genuine parse errors instead of "no questions could
// be parsed" for the whole file.
const CISA_QUESTION_RE = /^(\d+)\.\s+(.*)$/;
const CISA_OPTION_RE = /^([A-F])[.)]\s+(.*)$/;
// Accepts both "Answer: B" and "Correct Answer: B" - a real upload this
// session used the latter phrasing and failed to parse at all, since
// neither this format nor the Standard one's "Correct: B" matched it.
const CISA_ANSWER_RE = /^(?:Correct\s+)?Answer:\s*([A-F])/i;

async function parseCisaQaFormat(fileBuffer: Buffer): Promise<ParseResult> {
  const paragraphs = await extractParagraphs(fileBuffer);
  const valid: ParsedQuestion[] = [];
  const errors: ParseError[] = [];
  // Tracks every "N." label seen, in the order encountered, purely to
  // report numbering problems in the source file afterward (duplicates,
  // gaps) - confirmed a real, recurring source of confusion: a student's
  // "928-question" file actually only had 834 distinct question
  // paragraphs (134 numbers never appeared at all, 40 appeared twice),
  // which without this report looked indistinguishable from the app
  // silently dropping content.
  const seenNumbers: number[] = [];

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
    const qMatch = CISA_QUESTION_RE.exec(para.text);
    if (qMatch) {
      finalize();
      num = Number(qMatch[1]);
      stem = qMatch[2];
      seenNumbers.push(num);
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

  const warnings: string[] = [];
  if (seenNumbers.length > 0) {
    const counts = new Map<number, number>();
    for (const n of seenNumbers) counts.set(n, (counts.get(n) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([n]) => n);
    const maxNum = Math.max(...seenNumbers);
    const missing = maxNum - counts.size;

    if (duplicates.length > 0) {
      const shown = duplicates.slice(0, 20).join(', ') + (duplicates.length > 20 ? ', ...' : '');
      warnings.push(`${duplicates.length} question number(s) appear more than once in the source file: ${shown}`);
    }
    if (missing > 0) {
      warnings.push(
        `Question numbers in the source file run up to ${maxNum}, but only ${counts.size} distinct numbers were found (${missing} are missing). The file's own numbering has gaps, most likely from earlier edits.`
      );
    }
  }

  return { valid, errors, warnings };
}

// Standard Template format - this app's own simpler convention (no
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

  // No question-number labels in this format (each "Q:" is just counted in
  // order), so there's no numbering scheme to check for gaps/duplicates.
  return { valid, errors, warnings: [] };
}

// The create forms no longer expose a format picker (Standard Template is
// the only listed option) - but real content still arrives in whichever
// format it was originally authored in, CISA Q&A included (confirmed live:
// forcing every upload through the standard parser produced "No questions
// could be parsed" for an admin's real CISA-formatted file). Rather than
// trust whatever sourceFormat the client sends, try standard first and
// fall back to CISA Q&A automatically if it finds nothing - the two
// formats have distinctly different structure (Q:/A)/Correct: vs numbered
// bold stems with lettered options), so a file in one shape reliably
// parses to zero questions in the other, making "zero valid, try the other
// one" a safe detection signal rather than a guess.
async function fetchAndParse(fileUrl: string): Promise<{ result: ParseResult; detectedFormat: 'standard' | 'cisa_qa' }> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(fileUrl, blobToken ? { headers: { Authorization: `Bearer ${blobToken}` } } : undefined);
  if (!res.ok) throw Err.invalidArgument('Could not download the uploaded file');
  const buffer = Buffer.from(await res.arrayBuffer());

  const standardResult = await parseStandardTemplateFormat(buffer);
  if (standardResult.valid.length > 0) return { result: standardResult, detectedFormat: 'standard' };
  const cisaResult = await parseCisaQaFormat(buffer);
  if (cisaResult.valid.length > 0) return { result: cisaResult, detectedFormat: 'cisa_qa' };
  // Neither format found anything - report whichever attempt got further
  // (more parse errors surfaced usually means it was closer to being the
  // intended format), so the admin sees useful errors instead of nothing.
  return standardResult.errors.length >= cisaResult.errors.length
    ? { result: standardResult, detectedFormat: 'standard' }
    : { result: cisaResult, detectedFormat: 'cisa_qa' };
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

// Deletes every doc in a question subcollection plus each one's private
// answerKey. Used to read each question's own private/ subcollection first
// to discover what to delete there - one sequential await per question,
// which for a large bank (the 1,467-question CISM quiz that prompted this
// fix) blew past this function's 60-second maxDuration and got killed
// mid-delete by Vercel, leaving the quiz partially deleted. The answerKey
// doc's path is always known (every write goes through
// writeQuestionsBatch/updateQuestionCommon, both of which only ever touch
// .collection('private').doc('answerKey') - confirmed nothing else is ever
// written there), so it's referenced directly instead of discovered via a
// read; batch.delete() on a path that doesn't exist is a harmless no-op.
// This turns ~1,467 sequential round trips into 4 batch commits total.
async function deleteSubcollection(parentRef: DocumentReference, name: string): Promise<void> {
  const snap = await parentRef.collection(name).get();
  for (const group of chunk(snap.docs, 400)) {
    const batch = db.batch();
    for (const doc of group) {
      batch.delete(doc.ref.collection('private').doc('answerKey'));
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
// (the form itself takes whole rupees for readability) - both optional so
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
  currency: z.enum(['INR', 'USD']).default('INR'),
  category: z.string().trim().min(1).max(100).default('Other'),
  skillLevel: z.enum(SKILL_LEVELS).default('Foundation'),
  description: z.string().trim().max(5000).default(''),
  passMarkPercent: z.number().int().min(1).max(100).default(60),
  // How many of the first questions a non-buyer can try for free before
  // being asked to purchase - admin's choice per quiz, not a fixed
  // platform-wide number. 0 disables the free preview entirely.
  previewQuestionCount: z.number().int().min(0).max(200).default(5),
  // How many separate attempts a student may start for this quiz.
  // Defaults to 1, preserving the old single-attempt behavior.
  maxAttempts: z.number().int().min(1).max(50).default(1),
  // Access period shown at checkout / in the purchase-consent record.
  // 0 = no expiry ("Lifetime access"), the existing behaviour.
  accessPeriodDays: z.number().int().min(0).max(3650).default(0),
});

async function createQuiz(uid: string, body: unknown) {
  const parsed = createQuizSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const {
    result: { valid, errors, warnings },
    detectedFormat,
  } = await fetchAndParse(d.fileUrl);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const quizRef = db.collection('quizzes').doc();
  await quizRef.set({
    title: d.title,
    code: generateCode(),
    sourceFormat: detectedFormat,
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
    currency: d.currency,
    category: d.category,
    skillLevel: d.skillLevel,
    description: d.description,
    ratingAvg: 0,
    ratingCount: 0,
    passMarkPercent: d.passMarkPercent,
    previewQuestionCount: d.previewQuestionCount,
    maxAttempts: d.maxAttempts,
    accessPeriodDays: d.accessPeriodDays,
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

  return { quizId: quizRef.id, totalQuestions: valid.length, parseErrors: errors, parseWarnings: warnings };
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
  currency: z.enum(['INR', 'USD']).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  skillLevel: z.enum(SKILL_LEVELS).optional(),
  description: z.string().trim().max(5000).optional(),
  passMarkPercent: z.number().int().min(1).max(100).optional(),
  previewQuestionCount: z.number().int().min(0).max(200).optional(),
  maxAttempts: z.number().int().min(1).max(50).optional(),
  accessPeriodDays: z.number().int().min(0).max(3650).optional(),
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

// Shared by updateQuizQuestion/updatePracticeTestQuestion below - fixing a
// typo, a wrong option, or the marked-correct answer in an already-uploaded
// bank previously meant re-uploading the whole .docx from scratch.
const questionOptionSchema = z.object({ id: z.string().min(1), text: z.string().trim().min(1) });
const updateQuestionFieldsSchema = z.object({
  questionId: z.string().min(1),
  questionText: z.string().trim().min(1),
  options: z.array(questionOptionSchema).min(2),
  correctOptionId: z.string().min(1),
  // Optional domain/topic tag (Intelligent Learning, Release 3) - the only
  // way a question ever gets one; the bulk .docx upload parser never sets
  // it. Sent as '' to clear a previously-set tag.
  domain: z.string().trim().max(100).optional(),
});
type UpdateQuestionFields = z.infer<typeof updateQuestionFieldsSchema>;

async function updateQuestionCommon(
  uid: string,
  collectionName: 'quizzes' | 'practiceTests',
  parentId: string,
  d: UpdateQuestionFields
) {
  const parentRef = db.collection(collectionName).doc(parentId);
  const qRef = parentRef.collection('questions').doc(d.questionId);
  if (!(await qRef.get()).exists) throw Err.notFound('Question not found');
  if (!d.options.some((o) => o.id === d.correctOptionId)) {
    throw Err.invalidArgument('correctOptionId must match one of the given options');
  }

  await qRef.update({ questionText: d.questionText, options: d.options, domain: d.domain?.trim() || FieldValue.delete() });
  await qRef.collection('private').doc('answerKey').set({ correctOptionId: d.correctOptionId }, { merge: true });
  await writeAdminLog({
    performedBy: uid,
    action: collectionName === 'quizzes' ? 'updateQuizQuestion' : 'updatePracticeTestQuestion',
    targetType: 'question',
    targetId: d.questionId,
    description: `Edited a question in ${collectionName === 'quizzes' ? 'quiz' : 'practice test'} ${parentId}`,
  });
  return { success: true };
}

const updateQuizQuestionSchema = updateQuestionFieldsSchema.extend({ quizId: z.string().min(1) });

async function updateQuizQuestion(uid: string, body: unknown) {
  const parsed = updateQuizQuestionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId, ...d } = parsed.data;
  return updateQuestionCommon(uid, 'quizzes', quizId, d);
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
  // null means the admin is leaving session length up to each student
  // (see api/practice-session.ts's startOrResumeBatch, which then requires
  // the student to supply one when starting a fresh session) - the admin
  // still decides whether that choice exists at all, students never get it
  // unless this is explicitly left null.
  durationPerSessionMinutes: z.number().int().min(1).max(600).nullable(),
  defaultInitialBatchSize: z.number().int().min(1).max(500),
  price: z.number().int().min(0).default(0),
  originalPrice: z.number().int().min(0).nullable().optional(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  category: z.string().trim().min(1).max(100).default('Other'),
  skillLevel: z.enum(SKILL_LEVELS).default('Foundation'),
  description: z.string().trim().max(5000).default(''),
  // The certification/exam this content prepares for (e.g. "CISA") - see
  // PracticeTestDoc.examName in src/types/models.ts. Optional/blank is
  // fine; every reader falls back to `title`.
  examName: z.string().trim().max(100).default(''),
  // See createQuizSchema's previewQuestionCount comment - same convention.
  previewQuestionCount: z.number().int().min(0).max(200).default(5),
  // Personal Study Planner (Phase 1) config - read by
  // src/features/students/lib/studyPlan.ts's calculation engine and by
  // saveStudyPlan in api/practice-session.ts. All three have sensible
  // defaults so a test created before this feature existed behaves exactly
  // as it did before (planner enabled, 3-day buffer, 1.8 min/question).
  revisionBufferDays: z.number().int().min(0).max(60).default(3),
  defaultMinutesPerQuestion: z.number().min(0.1).max(30).default(1.8),
  studyPlannerEnabled: z.boolean().default(true),
  // See createQuizSchema's accessPeriodDays - 0 = Lifetime access.
  accessPeriodDays: z.number().int().min(0).max(3650).default(0),
});

async function createPracticeTest(uid: string, body: unknown) {
  const parsed = createPracticeTestSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const {
    result: { valid, errors, warnings },
    detectedFormat,
  } = await fetchAndParse(d.fileUrl);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const testRef = db.collection('practiceTests').doc();
  await testRef.set({
    title: d.title,
    availableFrom: Timestamp.fromDate(new Date(d.availableFrom)),
    availableUntil: Timestamp.fromDate(new Date(d.availableUntil)),
    durationPerSessionMinutes: d.durationPerSessionMinutes,
    defaultInitialBatchSize: d.defaultInitialBatchSize,
    sourceFormat: detectedFormat,
    totalQuestions: valid.length,
    price: d.price,
    originalPrice: d.originalPrice ?? null,
    currency: d.currency,
    category: d.category,
    skillLevel: d.skillLevel,
    description: d.description,
    examName: d.examName,
    ratingAvg: 0,
    ratingCount: 0,
    previewQuestionCount: d.previewQuestionCount,
    revisionBufferDays: d.revisionBufferDays,
    defaultMinutesPerQuestion: d.defaultMinutesPerQuestion,
    studyPlannerEnabled: d.studyPlannerEnabled,
    accessPeriodDays: d.accessPeriodDays,
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

  return { testId: testRef.id, totalQuestions: valid.length, parseErrors: errors, parseWarnings: warnings };
}

const updatePracticeTestSchema = z.object({
  testId: z.string().min(1),
  title: z.string().trim().min(2).max(200).optional(),
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  durationPerSessionMinutes: z.number().int().min(1).max(600).nullable().optional(),
  defaultInitialBatchSize: z.number().int().min(1).max(500).optional(),
  price: z.number().int().min(0).optional(),
  originalPrice: z.number().int().min(0).nullable().optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  skillLevel: z.enum(SKILL_LEVELS).optional(),
  description: z.string().trim().max(5000).optional(),
  examName: z.string().trim().max(100).optional(),
  previewQuestionCount: z.number().int().min(0).max(200).optional(),
  revisionBufferDays: z.number().int().min(0).max(60).optional(),
  defaultMinutesPerQuestion: z.number().min(0.1).max(30).optional(),
  studyPlannerEnabled: z.boolean().optional(),
  accessPeriodDays: z.number().int().min(0).max(3650).optional(),
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

const updatePracticeTestQuestionSchema = updateQuestionFieldsSchema.extend({ testId: z.string().min(1) });

async function updatePracticeTestQuestion(uid: string, body: unknown) {
  const parsed = updatePracticeTestQuestionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, ...d } = parsed.data;
  return updateQuestionCommon(uid, 'practiceTests', testId, d);
}

// ---------------------------------------------------------------------------
// Products & Pricing: Certification / Content Version / Package / Mock
// Blueprint actions - the admin configuration side of the "Certification ->
// Packages" learner catalog (see src/types/models.ts's CertificationDoc/
// PackageDoc for the full design rationale). A Package is purely a bundle
// reference to existing quizzes/practiceTests, never its own entitlement
// type - see PackageDoc's own comment. This phase is admin-configuration
// only: nothing here is read by the learner-facing checkout/cart/entitlement
// code (api/cart.ts's getLearnerCatalog, api/checkout.ts) beyond the
// `isPublished`/`price`/`originalPrice` bridge fields those already read
// unmodified from before this round.
// ---------------------------------------------------------------------------

// Duplicated from src/types/models.ts's CERTIFICATION_ICON_KEYS - same
// no-shared-code reasoning as SKILL_LEVELS above.
const CERTIFICATION_ICON_KEYS = ['shield', 'cloud', 'network', 'chart', 'generic'] as const;
const CERTIFICATION_STATUSES = ['draft', 'scheduled', 'published', 'unpublished', 'archived'] as const;
const PACKAGE_STATUSES = ['draft', 'published', 'unpublished', 'archived'] as const;

// Slug must be unique across every certification (excluding the one being
// edited, when updating) - single equality-filter query, no composite
// index needed, same convention used throughout this file.
async function assertSlugAvailable(slug: string, excludeCertificationId: string | null) {
  const snap = await db.collection('certifications').where('slug', '==', slug).get();
  const collision = snap.docs.find((d) => d.id !== excludeCertificationId);
  if (collision) throw Err.invalidArgument(`Slug "${slug}" is already used by another certification`);
}

// A scheduled certification "publishes at the configured server time" (item
// 14) with no cron job in this app - same lazy-computation, opportunistic
// self-heal pattern as api/checkout.ts's referral credit status. Called
// whenever certifications are listed; flips status/isPublished in place for
// any certification whose scheduled effectiveFrom has already passed.
async function resolveScheduledCertifications(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
  const now = Date.now();
  const batch = db.batch();
  let dirty = false;
  for (const d of docs) {
    const data = d.data();
    if (data.status === 'scheduled' && data.effectiveFrom && (data.effectiveFrom as Timestamp).toMillis() <= now) {
      batch.update(d.ref, { status: 'published', isPublished: true });
      data.status = 'published';
      data.isPublished = true;
      dirty = true;
    }
  }
  if (dirty) await batch.commit();
}

// Only the top-level fields that actually changed - kept short and
// JSON-serializable for the adminLogs doc, not a deep diff.
function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(after)) {
    if (key === 'updatedAt') continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field: key, from: a, to: b });
  }
  return diffs;
}

const contentVersionSchema = z.object({
  id: z.string().min(1).optional(), // omitted = create new
  versionName: z.string().trim().min(1).max(200),
  versionCode: z.string().trim().min(1).max(50),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
  associatedBankType: z.enum(['quiz', 'practiceTest']),
  associatedBankId: z.string().min(1),
  status: z.enum(['draft', 'active', 'retired']).default('draft'),
  notes: z.string().trim().max(1000).default(''),
});

const domainAllocationSchema = z.object({
  domain: z.string().trim().min(1).max(100),
  percent: z.number().min(0).max(100),
  questionCount: z.number().int().min(0),
});

const mockBlueprintSchema = z.object({
  id: z.string().min(1).optional(), // omitted = create new
  contentVersionId: z.string().min(1),
  totalQuestions: z.number().int().min(1),
  durationMinutes: z.number().int().min(1),
  domains: z.array(domainAllocationSchema).min(1),
  difficultyDistribution: z.object({ easy: z.number(), medium: z.number(), hard: z.number() }).nullable().default(null),
  repeatPolicy: z.enum(['minimize_repeats', 'allow_repeats']).default('minimize_repeats'),
  shuffleOptions: z.boolean().default(true),
  explanationRelease: z.enum(['after_submission', 'immediate', 'never']).default('after_submission'),
  allowPauseResume: z.boolean().default(true),
  autoSubmit: z.boolean().default(true),
  readinessThresholdPercent: z.number().min(0).max(100).nullable().default(null),
  status: z.enum(['draft', 'active']).default('draft'),
});

// --- Batched question-set upload -----------------------------------------
// One uploaded doc -> N practice-test batches + M mock-exam batches, all
// separate practiceTests/quizzes docs so every existing session/paywall/
// certificate path keeps working. Partition logic mirrors the tested
// src/features/admin/lib/seriesPartition.ts (no cross-imports across
// api/*.ts).

const createBatchedSeriesSchema = z.object({
  certificationId: z.string().min(1),
  fileUrl: z.string().url(),
  sourceFormat: z.enum(['standard', 'cisa_qa']).default('standard'),
  examName: z.string().trim().max(100).default(''),
  category: z.string().trim().min(1).max(100).default('Other'),
  practiceBatchSize: z.number().int().min(1).max(500).default(150),
  mockCount: z.number().int().min(1).max(20).default(5),
  mockBatchSize: z.number().int().min(1).max(500).default(150),
  mockDurationMinutes: z.number().int().min(1).max(600).default(240),
  passMarkPercent: z.number().int().min(0).max(100).default(60),
  previewQuestionCount: z.number().int().min(0).max(200).default(5),
  durationPerSessionMinutes: z.number().int().min(1).max(600).nullable().default(null),
});

function contiguousRanges(total: number, size: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let start = 0; start < total; start += size) out.push({ start, end: Math.min(start + size, total) });
  return out;
}

async function createBatchedSeries(uid: string, body: unknown) {
  const parsed = createBatchedSeriesSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const certRef = db.collection('certifications').doc(d.certificationId);
  const certSnap = await certRef.get();
  if (!certSnap.exists) throw Err.notFound('Certification not found');

  const {
    result: { valid, errors, warnings },
    detectedFormat,
  } = await fetchAndParse(d.fileUrl);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const farFuture = Timestamp.fromMillis(Date.now() + 3650 * 24 * 60 * 60 * 1000);
  const name = d.examName || (certSnap.data()!.shortName as string) || 'Exam';
  const seriesRef = db.collection('contentSeries').doc();

  // Practice batches: every question, contiguous, 150 each (last may be short).
  const practiceTestIds: string[] = [];
  const practiceRanges = contiguousRanges(valid.length, d.practiceBatchSize);
  for (let i = 0; i < practiceRanges.length; i++) {
    const { start, end } = practiceRanges[i];
    const slice = valid.slice(start, end).map((q, k) => ({ ...q, order: k + 1 }));
    const ref = db.collection('practiceTests').doc();
    await ref.set({
      title: `${name} - Practice Exam ${i + 1}`,
      availableFrom: Timestamp.now(),
      availableUntil: farFuture,
      durationPerSessionMinutes: d.durationPerSessionMinutes,
      defaultInitialBatchSize: Math.min(25, slice.length),
      sourceFormat: detectedFormat,
      totalQuestions: slice.length,
      price: 0,
      originalPrice: null,
      currency: 'INR',
      category: d.category,
      skillLevel: 'Foundation',
      description: `Practice Exam ${i + 1} of ${practiceRanges.length} for ${name}.`,
      examName: name,
      ratingAvg: 0,
      ratingCount: 0,
      previewQuestionCount: d.previewQuestionCount,
      revisionBufferDays: 3,
      defaultMinutesPerQuestion: 1.8,
      studyPlannerEnabled: true,
      accessPeriodDays: 0,
      requiresEntitlement: true,
      seriesId: seriesRef.id,
      batchIndex: i + 1,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    await writeQuestionsBatch(ref, slice);
    practiceTestIds.push(ref.id);
  }

  // Mock batches: the first mockCount * mockBatchSize questions, split into
  // non-overlapping fixed sets; shuffled per attempt (api/quiz-session.ts).
  const mockQuizIds: string[] = [];
  const mockRanges = contiguousRanges(Math.min(valid.length, d.mockCount * d.mockBatchSize), d.mockBatchSize).slice(
    0,
    d.mockCount,
  );
  for (let i = 0; i < mockRanges.length; i++) {
    const { start, end } = mockRanges[i];
    const slice = valid.slice(start, end).map((q, k) => ({ ...q, order: k + 1 }));
    const ref = db.collection('quizzes').doc();
    await ref.set({
      title: `${name} - Mock Exam ${i + 1}`,
      code: generateCode(),
      sourceFormat: detectedFormat,
      totalQuestions: slice.length,
      enforceSequentialNav: false,
      showImmediateResult: false,
      showFinalScore: true,
      durationType: 'overall',
      durationMinutes: d.mockDurationMinutes,
      scheduledStart: null,
      isPublished: true,
      antiCheat: { blockAltTab: true },
      price: 0,
      originalPrice: null,
      currency: 'INR',
      category: d.category,
      skillLevel: 'Foundation',
      description: `Full-length timed mock exam ${i + 1} of ${mockRanges.length} for ${name}. Questions and options are shuffled each attempt.`,
      ratingAvg: 0,
      ratingCount: 0,
      passMarkPercent: d.passMarkPercent,
      previewQuestionCount: d.previewQuestionCount,
      maxAttempts: 3,
      accessPeriodDays: 0,
      isMock: true,
      shufflePerAttempt: true,
      requiresEntitlement: true,
      seriesId: seriesRef.id,
      batchIndex: i + 1,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    await writeQuestionsBatch(ref, slice);
    mockQuizIds.push(ref.id);
  }

  await seriesRef.set({
    certificationId: d.certificationId,
    examName: name,
    category: d.category,
    sourceFileUrl: d.fileUrl,
    sourceFormat: detectedFormat,
    totalQuestions: valid.length,
    practiceBatchSize: d.practiceBatchSize,
    practiceTestIds,
    mockQuizIds,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });

  await certRef.update({
    seriesId: seriesRef.id,
    practiceBankIds: practiceTestIds,
    mockBankIds: mockQuizIds,
    practiceBankId: practiceTestIds[0] ?? null,
    mockBankId: mockQuizIds[0] ?? null,
    updatedAt: now,
  });

  await writeAdminLog({
    performedBy: uid,
    action: 'createBatchedSeries',
    targetType: 'certification',
    targetId: d.certificationId,
    description: `Uploaded ${valid.length} questions for "${name}" - ${practiceTestIds.length} practice batches, ${mockQuizIds.length} mock exams`,
  });

  return {
    seriesId: seriesRef.id,
    practiceTestIds,
    mockQuizIds,
    totalQuestions: valid.length,
    parseErrors: errors,
    parseWarnings: warnings,
  };
}

const createCertificationSchema = z.object({
  shortName: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(200),
  provider: z.string().trim().min(1).max(100).default('Other'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  category: z.string().trim().min(1).max(100).default('Other'),
  shortDescription: z.string().trim().max(300).default(''),
  description: z.string().trim().max(5000).default(''),
  iconKey: z.enum(CERTIFICATION_ICON_KEYS).default('generic'),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  defaultValidityDays: z.number().int().min(1).max(3650).default(180),
  featured: z.boolean().default(false),
  independentPrepDisclaimer: z.string().trim().max(1000).default(''),
  displayOrder: z.number().int().min(0).default(0),
  // The simplified product form's remembered bank choices (see
  // CertificationDoc). Practice packages reference the practiceTest bank
  // directly; the quiz bank additionally backs the mock content version.
  practiceBankId: z.string().min(1).nullable().optional(),
  mockBankId: z.string().min(1).nullable().optional(),
});

async function createCertification(uid: string, body: unknown) {
  const parsed = createCertificationSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  await assertSlugAvailable(d.slug, null);

  const now = FieldValue.serverTimestamp();
  const ref = db.collection('certifications').doc();
  await ref.set({
    shortName: d.shortName,
    name: d.name,
    provider: d.provider,
    slug: d.slug,
    category: d.category,
    shortDescription: d.shortDescription,
    description: d.description,
    iconKey: d.iconKey,
    effectiveFrom: d.effectiveFrom ? Timestamp.fromDate(new Date(d.effectiveFrom)) : null,
    effectiveTo: d.effectiveTo ? Timestamp.fromDate(new Date(d.effectiveTo)) : null,
    defaultValidityDays: d.defaultValidityDays,
    featured: d.featured,
    // Every certification starts as a Draft - publishing is always an
    // explicit, separate action (see publishCertification below), never a
    // side effect of the create call.
    status: 'draft' as const,
    independentPrepDisclaimer: d.independentPrepDisclaimer,
    practiceBankId: d.practiceBankId ?? null,
    mockBankId: d.mockBankId ?? null,
    contentVersions: [],
    mockBlueprints: [],
    isPublished: false,
    displayOrder: d.displayOrder,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await writeAdminLog({
    performedBy: uid,
    action: 'createCertification',
    targetType: 'certification',
    targetId: ref.id,
    description: `Created certification "${d.name}" (${d.shortName})`,
  });
  return { certificationId: ref.id };
}

const updateCertificationSchema = z.object({
  certificationId: z.string().min(1),
  shortName: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only')
    .optional(),
  category: z.string().trim().min(1).max(100).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  iconKey: z.enum(CERTIFICATION_ICON_KEYS).optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  defaultValidityDays: z.number().int().min(1).max(3650).optional(),
  featured: z.boolean().optional(),
  independentPrepDisclaimer: z.string().trim().max(1000).optional(),
  displayOrder: z.number().int().min(0).optional(),
  practiceBankId: z.string().min(1).nullable().optional(),
  mockBankId: z.string().min(1).nullable().optional(),
});

async function updateCertification(uid: string, body: unknown) {
  const parsed = updateCertificationSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, effectiveFrom, effectiveTo, ...rest } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  if (rest.slug && rest.slug !== existing.slug) await assertSlugAvailable(rest.slug, certificationId);

  const update: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
  if (effectiveFrom !== undefined) update.effectiveFrom = effectiveFrom ? Timestamp.fromDate(new Date(effectiveFrom)) : null;
  if (effectiveTo !== undefined) update.effectiveTo = effectiveTo ? Timestamp.fromDate(new Date(effectiveTo)) : null;

  await ref.update(update);
  const diffs = diffFields(existing, update);
  await writeAdminLog({
    performedBy: uid,
    action: 'updateCertification',
    targetType: 'certification',
    targetId: certificationId,
    description: `Updated certification "${existing.name}"${diffs.length ? ` (${diffs.map((d) => d.field).join(', ')})` : ''}`,
    previousValue: Object.fromEntries(diffs.map((d) => [d.field, d.from])),
    newValue: Object.fromEntries(diffs.map((d) => [d.field, d.to])),
  });
  return { success: true };
}

const certificationIdSchema = z.object({ certificationId: z.string().min(1) });

async function deleteCertification(uid: string, body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');

  // Refuse a cascading delete - an admin must archive/delete the dependent
  // packages first. This is a hard delete (only ever reachable for a
  // certification that never had any packages); once packages exist, the
  // recommended path is Archive, not delete.
  const dependentPackages = await db.collection('packages').where('certificationId', '==', certificationId).get();
  if (!dependentPackages.empty) {
    const names = dependentPackages.docs.map((d) => d.data().name).join(', ');
    throw Err.failedPrecondition(`Delete or archive the dependent package(s) first: ${names}`);
  }

  await ref.delete();
  await writeAdminLog({
    performedBy: uid,
    action: 'deleteCertification',
    targetType: 'certification',
    targetId: certificationId,
    description: `Deleted certification "${snap.data()?.name}"`,
  });
  return { success: true };
}

// Publication lifecycle - Draft/Scheduled/Published/Unpublished/Archived
// (item 14). Publishing a certification does not require it to already
// have packages (packages have their own independent publish gate, see
// canPublishPackage); this action only governs the certification record
// itself becoming visible to a future learner integration.
const publishCertificationSchema = z.object({
  certificationId: z.string().min(1),
  scheduledFor: z.string().datetime().nullable().optional(), // set = "Schedule Publication" instead of "Publish Now"
});

async function publishCertification(uid: string, body: unknown) {
  const parsed = publishCertificationSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, scheduledFor } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;
  if (!existing.shortName || !existing.name || !existing.slug) {
    throw Err.invalidArgument('Complete the Certification step (short name, display name, slug) before publishing');
  }

  const isScheduled = !!scheduledFor && new Date(scheduledFor).getTime() > Date.now();
  const nextStatus = isScheduled ? 'scheduled' : 'published';
  await ref.update({
    status: nextStatus,
    isPublished: !isScheduled,
    effectiveFrom: isScheduled ? Timestamp.fromDate(new Date(scheduledFor!)) : existing.effectiveFrom ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAdminLog({
    performedBy: uid,
    action: isScheduled ? 'scheduleCertification' : 'publishCertification',
    targetType: 'certification',
    targetId: certificationId,
    description: isScheduled
      ? `Scheduled "${existing.name}" to publish at ${scheduledFor}`
      : `Published certification "${existing.name}"`,
    previousValue: { status: existing.status },
    newValue: { status: nextStatus },
  });
  return { success: true, status: nextStatus };
}

async function unpublishCertification(uid: string, body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certifications').doc(parsed.data.certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  await ref.update({ status: 'unpublished', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'unpublishCertification',
    targetType: 'certification',
    targetId: parsed.data.certificationId,
    description: `Unpublished certification "${existing.name}"`,
    previousValue: { status: existing.status },
    newValue: { status: 'unpublished' },
  });
  return { success: true };
}

async function archiveCertification(uid: string, body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certifications').doc(parsed.data.certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  await ref.update({ status: 'archived', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'archiveCertification',
    targetType: 'certification',
    targetId: parsed.data.certificationId,
    description: `Archived certification "${existing.name}"`,
    previousValue: { status: existing.status },
    newValue: { status: 'archived' },
  });
  return { success: true };
}

async function restoreCertification(uid: string, body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certifications').doc(parsed.data.certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;
  if (existing.status !== 'archived') throw Err.failedPrecondition('Only an archived certification can be restored');

  // Restores to Draft, not straight back to Published - an admin should
  // consciously re-publish rather than have an archived product silently
  // reappear live.
  await ref.update({ status: 'draft', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'restoreCertification',
    targetType: 'certification',
    targetId: parsed.data.certificationId,
    description: `Restored certification "${existing.name}" to Draft`,
    previousValue: { status: 'archived' },
    newValue: { status: 'draft' },
  });
  return { success: true };
}

async function duplicateCertification(uid: string, body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certifications').doc(parsed.data.certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  // A unique slug for the copy - timestamp suffix rather than a counting
  // loop, simple and collision-proof enough for an admin-only, low-volume
  // action.
  const copySlug = `${existing.slug}-copy-${Date.now().toString(36)}`;
  const now = FieldValue.serverTimestamp();
  const newRef = db.collection('certifications').doc();
  const packagesSnap = await db.collection('packages').where('certificationId', '==', parsed.data.certificationId).get();

  const batch = db.batch();
  batch.set(newRef, {
    ...existing,
    slug: copySlug,
    name: `${existing.name} (Copy)`,
    status: 'draft',
    isPublished: false,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  for (const pkgDoc of packagesSnap.docs) {
    const pkgData = pkgDoc.data();
    batch.set(db.collection('packages').doc(), {
      ...pkgData,
      certificationId: newRef.id,
      status: 'draft',
      isPublished: false,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();

  await writeAdminLog({
    performedBy: uid,
    action: 'duplicateCertification',
    targetType: 'certification',
    targetId: newRef.id,
    description: `Duplicated "${existing.name}" (${packagesSnap.size} package(s)) as a new draft`,
  });
  return { certificationId: newRef.id };
}

async function listCertificationsAdmin() {
  const snap = await db.collection('certifications').orderBy('displayOrder').get();
  await resolveScheduledCertifications(snap.docs);
  return {
    certifications: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Normalise the batched-series fields so the client type is always satisfied.
        practiceBankIds: (data.practiceBankIds as string[] | undefined) ?? (data.practiceBankId ? [data.practiceBankId] : []),
        mockBankIds: (data.mockBankIds as string[] | undefined) ?? (data.mockBankId ? [data.mockBankId] : []),
        seriesId: (data.seriesId as string | undefined) ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Content versions & mock blueprints - both embedded arrays on the
// certification doc (see CertificationDoc's own comment for why: a handful
// of small, always-edited-together records, not a query-heavy collection).
// ---------------------------------------------------------------------------

async function saveContentVersion(uid: string, body: unknown) {
  const parsed = z.object({ certificationId: z.string().min(1), version: contentVersionSchema }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, version } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  // The referenced bank must actually exist, and - "archived question
  // banks cannot be selected for new products" - must still be published.
  // Only QuizDoc has an isPublished field at all; PracticeTestDoc has no
  // archived/unpublished concept in this data model (only an
  // availableFrom/availableUntil window), so this check only applies to a
  // quiz bank.
  const bankRef = db.collection(version.associatedBankType === 'quiz' ? 'quizzes' : 'practiceTests').doc(version.associatedBankId);
  const bankSnap = await bankRef.get();
  if (!bankSnap.exists) throw Err.invalidArgument('associatedBankId does not reference an existing question bank');
  if (version.associatedBankType === 'quiz' && !bankSnap.data()?.isPublished) {
    throw Err.invalidArgument('This quiz is unpublished/archived and cannot be selected for a new content version');
  }

  const versions: Array<Record<string, unknown>> = existing.contentVersions ?? [];
  const effectiveFrom = Timestamp.fromDate(new Date(version.effectiveFrom));
  const effectiveTo = version.effectiveTo ? Timestamp.fromDate(new Date(version.effectiveTo)) : null;
  const id = version.id ?? db.collection('_ids').doc().id;

  // "Content-version effective dates must not conflict" - no two versions
  // on the same certification may have overlapping [effectiveFrom, effectiveTo) windows.
  const overlaps = versions.some((v) => {
    if (v.id === id) return false;
    const vFrom = (v.effectiveFrom as Timestamp).toMillis();
    const vTo = v.effectiveTo ? (v.effectiveTo as Timestamp).toMillis() : Infinity;
    const newFrom = effectiveFrom.toMillis();
    const newTo = effectiveTo ? effectiveTo.toMillis() : Infinity;
    return newFrom < vTo && vFrom < newTo;
  });
  if (overlaps) throw Err.invalidArgument('This version\'s effective dates overlap with another version on this certification');

  const nextVersion = {
    id,
    versionName: version.versionName,
    versionCode: version.versionCode,
    effectiveFrom,
    effectiveTo,
    associatedBankType: version.associatedBankType,
    associatedBankId: version.associatedBankId,
    status: version.status,
    notes: version.notes,
  };
  const nextVersions = version.id ? versions.map((v) => (v.id === id ? nextVersion : v)) : [...versions, nextVersion];

  await ref.update({ contentVersions: nextVersions, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: version.id ? 'updateContentVersion' : 'createContentVersion',
    targetType: 'contentVersion',
    targetId: id,
    description: `${version.id ? 'Updated' : 'Created'} content version "${version.versionName}" on "${existing.name}"`,
  });
  return { versionId: id };
}

async function deleteContentVersion(uid: string, body: unknown) {
  const parsed = z.object({ certificationId: z.string().min(1), versionId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, versionId } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  const blueprintUsingVersion = ((existing.mockBlueprints ?? []) as Array<{ contentVersionId: string }>).find((b) => b.contentVersionId === versionId);
  if (blueprintUsingVersion) throw Err.failedPrecondition('Remove or reassign the Mock Rules blueprint using this version first');

  const nextVersions = ((existing.contentVersions ?? []) as Array<{ id: string }>).filter((v) => v.id !== versionId);
  await ref.update({ contentVersions: nextVersions, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'deleteContentVersion',
    targetType: 'contentVersion',
    targetId: versionId,
    description: `Deleted a content version on "${existing.name}"`,
  });
  return { success: true };
}

// The domain distribution of a bank's published questions - used both to
// populate the Mock Rules editor and to validate a blueprint's domain
// allocations against what the bank can actually support. Single
// collection read (this repo's banks run up to ~1,500 questions, the same
// scale api/content-admin.ts's own answer-key actions already read in one
// shot), grouped in memory rather than one query per domain.
async function getBankDomainCounts(body: unknown) {
  const parsed = z.object({ bankType: z.enum(['quiz', 'practiceTest']), bankId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { bankType, bankId } = parsed.data;

  const snap = await db.collection(bankType === 'quiz' ? 'quizzes' : 'practiceTests').doc(bankId).collection('questions').get();
  const byDomain: Record<string, number> = {};
  let total = 0;
  for (const d of snap.docs) {
    total += 1;
    const domain = (d.data().domain as string | undefined)?.trim();
    if (domain) byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }
  return { totalQuestions: total, byDomain };
}

async function saveMockBlueprint(uid: string, body: unknown) {
  const parsed = z.object({ certificationId: z.string().min(1), blueprint: mockBlueprintSchema }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, blueprint } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  const versions: Array<{ id: string; associatedBankType: 'quiz' | 'practiceTest'; associatedBankId: string }> = existing.contentVersions ?? [];
  const version = versions.find((v) => v.id === blueprint.contentVersionId);
  if (!version) throw Err.invalidArgument('contentVersionId does not reference an existing content version on this certification');

  // Validation, duplicated from src/features/admin/lib/mockBlueprintValidation.ts's
  // tested canonical version (no cross-file imports across api/*.ts).
  const domainSum = blueprint.domains.reduce((s, d) => s + d.percent, 0);
  if (Math.abs(domainSum - 100) > 0.5) throw Err.invalidArgument('Domain percentages must add up to 100%');
  const questionSum = blueprint.domains.reduce((s, d) => s + d.questionCount, 0);
  if (questionSum !== blueprint.totalQuestions) throw Err.invalidArgument('Domain question counts must add up to the total questions per mock');
  if (blueprint.difficultyDistribution) {
    const diffSum = blueprint.difficultyDistribution.easy + blueprint.difficultyDistribution.medium + blueprint.difficultyDistribution.hard;
    if (Math.abs(diffSum - 100) > 0.5) throw Err.invalidArgument('Difficulty percentages must add up to 100%');
  }
  const { byDomain } = await getBankDomainCounts({ bankType: version.associatedBankType, bankId: version.associatedBankId });
  const short = blueprint.domains.filter((d) => (byDomain[d.domain] ?? 0) < d.questionCount).map((d) => d.domain);
  if (short.length > 0) throw Err.invalidArgument(`Not enough eligible published questions for: ${short.join(', ')}`);

  const blueprints: Array<Record<string, unknown>> = existing.mockBlueprints ?? [];
  const id = blueprint.id ?? db.collection('_ids').doc().id;
  const nextBlueprint = { ...blueprint, id };
  const nextBlueprints = blueprint.id ? blueprints.map((b) => (b.id === id ? nextBlueprint : b)) : [...blueprints, nextBlueprint];

  await ref.update({ mockBlueprints: nextBlueprints, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: blueprint.id ? 'updateMockBlueprint' : 'createMockBlueprint',
    targetType: 'mockBlueprint',
    targetId: id,
    description: `${blueprint.id ? 'Updated' : 'Created'} Mock Rules blueprint on "${existing.name}"`,
  });
  return { blueprintId: id };
}

async function deleteMockBlueprint(uid: string, body: unknown) {
  const parsed = z.object({ certificationId: z.string().min(1), blueprintId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId, blueprintId } = parsed.data;

  const ref = db.collection('certifications').doc(certificationId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certification not found');
  const existing = snap.data()!;

  const nextBlueprints = ((existing.mockBlueprints ?? []) as Array<{ id: string }>).filter((b) => b.id !== blueprintId);
  await ref.update({ mockBlueprints: nextBlueprints, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'deleteMockBlueprint',
    targetType: 'mockBlueprint',
    targetId: blueprintId,
    description: `Deleted a Mock Rules blueprint on "${existing.name}"`,
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const packageAccessSchema = {
  packageType: z.string().trim().min(1).max(50).default('custom'),
  shortDescription: z.string().trim().max(300).default(''),
  includedFeatures: z.array(z.string().trim().min(1).max(200)).default([]),
  practiceAccessEnabled: z.boolean().default(false),
  accessibleQuestionCount: z.number().int().min(0).default(0),
  explanationAccessEnabled: z.boolean().default(false),
  mockAccessEnabled: z.boolean().default(false),
  fullMockAttempts: z.number().int().min(0).default(0),
  miniMockAttempts: z.number().int().min(0).default(0),
  questionsPerMock: z.number().int().min(0).default(0),
  mockDurationMinutes: z.number().int().min(0).default(0),
  studyPlanAccessEnabled: z.boolean().default(false),
  analyticsAccessEnabled: z.boolean().default(false),
  trialAvailable: z.boolean().default(false),
  accessValidityDays: z.number().int().min(1).max(3650).default(180),
  renewalAvailable: z.boolean().default(false),
  upgradeAvailable: z.boolean().default(false),
  promoEligible: z.boolean().default(true),
  referralEligible: z.boolean().default(true),
  refundEligible: z.boolean().default(true),
  regularPrice: z.number().int().min(0),
  sellingPrice: z.number().int().min(0),
  offerPrice: z.number().int().min(0).nullable().optional(),
  offerStart: z.string().datetime().nullable().optional(),
  offerEnd: z.string().datetime().nullable().optional(),
  renewalPrice: z.number().int().min(0).nullable().optional(),
  taxTreatment: z.enum(['inclusive', 'exclusive', 'exempt']).default('inclusive'),
  isFree: z.boolean().default(false),
  currency: z.enum(['INR', 'USD']).default('INR'),
  // Complete-only: what the admin waived off (Practice + Mock) when pricing
  // the combo. Display/round-trip only - `sellingPrice` already carries the
  // final figure. null on every other package.
  comboDiscount: z.object({ mode: z.enum(['percent', 'amount']), value: z.number().int().min(0) }).nullable().default(null),
};

const createPackageSchema = z.object({
  certificationId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
  badgeText: z.string().trim().max(60).nullable().optional(),
  isRecommended: z.boolean().default(false),
  description: z.string().trim().max(2000).default(''),
  includedQuizIds: z.array(z.string().min(1)).default([]),
  includedPracticeTestIds: z.array(z.string().min(1)).default([]),
  displayOrder: z.number().int().min(0).default(0),
  ...packageAccessSchema,
});

// Shared by createPackage/updatePackage: confirms the certification and
// every included item actually exist and are published (see
// saveContentVersion's own comment on treating an unpublished bank as
// "archived" for this repo's purposes), enforces a unique package name
// within the certification, and - if this package is being set as the
// recommended one - unsets any sibling's isRecommended flag in the same
// batch (at most one recommended package per certification is an
// application-level invariant, not a Firestore constraint).
async function validatePackageRefsAndClearSiblingRecommended(
  certificationId: string,
  name: string,
  includedQuizIds: string[],
  includedPracticeTestIds: string[],
  makeRecommended: boolean,
  excludePackageId: string | null,
  batch: FirebaseFirestore.WriteBatch
) {
  const certSnap = await db.collection('certifications').doc(certificationId).get();
  if (!certSnap.exists) throw Err.invalidArgument('certificationId does not reference an existing certification');

  if (includedQuizIds.length === 0 && includedPracticeTestIds.length === 0) {
    throw Err.invalidArgument('A package must include at least one quiz or practice test');
  }
  // db.getAll() throws when called with zero refs - a package can legally
  // include only quizzes or only practice tests, so either list can be
  // empty on its own even though the combined check above passed.
  const [quizSnaps, testSnaps] = await Promise.all([
    includedQuizIds.length > 0 ? db.getAll(...includedQuizIds.map((id) => db.collection('quizzes').doc(id))) : Promise.resolve([]),
    includedPracticeTestIds.length > 0
      ? db.getAll(...includedPracticeTestIds.map((id) => db.collection('practiceTests').doc(id)))
      : Promise.resolve([]),
  ]);
  const missingQuiz = quizSnaps.find((s) => !s.exists);
  if (missingQuiz) throw Err.invalidArgument(`includedQuizIds references a quiz that does not exist: ${missingQuiz.id}`);
  const missingTest = testSnaps.find((s) => !s.exists);
  if (missingTest) throw Err.invalidArgument(`includedPracticeTestIds references a practice test that does not exist: ${missingTest.id}`);
  // Only QuizDoc has an isPublished field - PracticeTestDoc has no
  // archived/unpublished concept in this data model (see
  // saveContentVersion's own comment on the same distinction).
  const archivedQuiz = quizSnaps.find((s) => !s.data()?.isPublished);
  if (archivedQuiz) throw Err.invalidArgument(`Quiz "${archivedQuiz.id}" is unpublished/archived and cannot be added to a new package`);

  const siblingsSnap = await db.collection('packages').where('certificationId', '==', certificationId).get();
  const nameCollision = siblingsSnap.docs.find(
    (d) => d.id !== excludePackageId && (d.data().name as string).trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (nameCollision) throw Err.invalidArgument(`A package named "${name}" already exists under this certification`);

  if (makeRecommended) {
    for (const sibling of siblingsSnap.docs) {
      if (sibling.id !== excludePackageId && sibling.data().isRecommended) batch.update(sibling.ref, { isRecommended: false });
    }
  }
}

// "Offer price cannot exceed regular price", "offer end after offer
// start", "package cannot publish without a valid price unless Free" -
// duplicated from src/features/admin/lib/packageValidation.ts's tested
// canonical version.
function validatePackagePricing(d: {
  regularPrice: number;
  sellingPrice: number;
  offerPrice?: number | null;
  offerStart?: string | null;
  offerEnd?: string | null;
  isFree?: boolean;
}) {
  if (d.regularPrice < 0) throw Err.invalidArgument('Regular price cannot be negative');
  if (d.sellingPrice < 0) throw Err.invalidArgument('Selling price cannot be negative');
  if (d.offerPrice !== undefined && d.offerPrice !== null) {
    if (d.offerPrice < 0) throw Err.invalidArgument('Offer price cannot be negative');
    if (d.offerPrice > d.regularPrice) throw Err.invalidArgument('Offer price cannot exceed the regular price');
  }
  if (d.offerStart && d.offerEnd && new Date(d.offerEnd).getTime() <= new Date(d.offerStart).getTime()) {
    throw Err.invalidArgument('Offer end must be later than offer start');
  }
  if (!d.isFree && d.sellingPrice <= 0) throw Err.invalidArgument('Selling price must be greater than zero unless this package is marked Free');
}

async function createPackage(uid: string, body: unknown) {
  const parsed = createPackageSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  validatePackagePricing(d);
  if (d.practiceAccessEnabled && d.accessibleQuestionCount > 0) {
    // Checked again, more precisely (against the actual referenced banks'
    // question counts), at publish time in publishPackage - this create-
    // time check only guards the obviously-wrong "more than physically
    // possible" case using the banks named in this same call.
  }

  const batch = db.batch();
  await validatePackageRefsAndClearSiblingRecommended(d.certificationId, d.name, d.includedQuizIds, d.includedPracticeTestIds, d.isRecommended, null, batch);

  const now = FieldValue.serverTimestamp();
  const ref = db.collection('packages').doc();
  batch.set(ref, {
    certificationId: d.certificationId,
    packageType: d.packageType,
    name: d.name,
    shortDescription: d.shortDescription,
    includedFeatures: d.includedFeatures,
    badgeText: d.badgeText ?? null,
    isRecommended: d.isRecommended,
    description: d.description,
    includedQuizIds: d.includedQuizIds,
    includedPracticeTestIds: d.includedPracticeTestIds,
    practiceAccessEnabled: d.practiceAccessEnabled,
    accessibleQuestionCount: d.accessibleQuestionCount,
    explanationAccessEnabled: d.explanationAccessEnabled,
    mockAccessEnabled: d.mockAccessEnabled,
    fullMockAttempts: d.fullMockAttempts,
    miniMockAttempts: d.miniMockAttempts,
    questionsPerMock: d.questionsPerMock,
    mockDurationMinutes: d.mockDurationMinutes,
    studyPlanAccessEnabled: d.studyPlanAccessEnabled,
    analyticsAccessEnabled: d.analyticsAccessEnabled,
    trialAvailable: d.trialAvailable,
    accessValidityDays: d.accessValidityDays,
    renewalAvailable: d.renewalAvailable,
    upgradeAvailable: d.upgradeAvailable,
    promoEligible: d.promoEligible,
    referralEligible: d.referralEligible,
    refundEligible: d.refundEligible,
    currency: d.currency,
    regularPrice: d.regularPrice,
    sellingPrice: d.sellingPrice,
    offerPrice: d.offerPrice ?? null,
    offerStart: d.offerStart ? Timestamp.fromDate(new Date(d.offerStart)) : null,
    offerEnd: d.offerEnd ? Timestamp.fromDate(new Date(d.offerEnd)) : null,
    offerCancelledAt: null,
    renewalPrice: d.renewalPrice ?? null,
    taxTreatment: d.taxTreatment,
    isFree: d.isFree,
    comboDiscount: d.comboDiscount ?? null,
    status: 'draft' as const,
    isPublished: false,
    // Bridge fields - see PackageDoc's own comment. Kept in sync with
    // sellingPrice/regularPrice so a future, unmodified learner-checkout
    // read of `price`/`originalPrice` reflects the same numbers.
    price: d.sellingPrice,
    originalPrice: d.regularPrice > d.sellingPrice ? d.regularPrice : null,
    displayOrder: d.displayOrder,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();

  await writeAdminLog({
    performedBy: uid,
    action: 'createPackage',
    targetType: 'package',
    targetId: ref.id,
    description: `Created package "${d.name}" under certification ${d.certificationId}`,
  });
  return { packageId: ref.id };
}

const updatePackageSchema = z.object({
  packageId: z.string().min(1),
  name: z.string().trim().min(2).max(200).optional(),
  badgeText: z.string().trim().max(60).nullable().optional(),
  isRecommended: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
  includedQuizIds: z.array(z.string().min(1)).optional(),
  includedPracticeTestIds: z.array(z.string().min(1)).optional(),
  displayOrder: z.number().int().min(0).optional(),
  // Every access/pricing field is independently optional here (a partial
  // update) - statically listed rather than derived from
  // packageAccessSchema, since z.infer can't see through a dynamically
  // built object shape.
  packageType: z.string().trim().min(1).max(50).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  includedFeatures: z.array(z.string().trim().min(1).max(200)).optional(),
  practiceAccessEnabled: z.boolean().optional(),
  accessibleQuestionCount: z.number().int().min(0).optional(),
  explanationAccessEnabled: z.boolean().optional(),
  mockAccessEnabled: z.boolean().optional(),
  fullMockAttempts: z.number().int().min(0).optional(),
  miniMockAttempts: z.number().int().min(0).optional(),
  questionsPerMock: z.number().int().min(0).optional(),
  mockDurationMinutes: z.number().int().min(0).optional(),
  studyPlanAccessEnabled: z.boolean().optional(),
  analyticsAccessEnabled: z.boolean().optional(),
  trialAvailable: z.boolean().optional(),
  accessValidityDays: z.number().int().min(1).max(3650).optional(),
  renewalAvailable: z.boolean().optional(),
  upgradeAvailable: z.boolean().optional(),
  promoEligible: z.boolean().optional(),
  referralEligible: z.boolean().optional(),
  refundEligible: z.boolean().optional(),
  regularPrice: z.number().int().min(0).optional(),
  sellingPrice: z.number().int().min(0).optional(),
  offerPrice: z.number().int().min(0).nullable().optional(),
  offerStart: z.string().datetime().nullable().optional(),
  offerEnd: z.string().datetime().nullable().optional(),
  renewalPrice: z.number().int().min(0).nullable().optional(),
  taxTreatment: z.enum(['inclusive', 'exclusive', 'exempt']).optional(),
  isFree: z.boolean().optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  comboDiscount: z.object({ mode: z.enum(['percent', 'amount']), value: z.number().int().min(0) }).nullable().optional(),
});

async function updatePackage(uid: string, body: unknown) {
  const parsed = updatePackageSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { packageId, offerStart, offerEnd, ...rest } = parsed.data as z.infer<typeof updatePackageSchema>;

  const ref = db.collection('packages').doc(packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;

  validatePackagePricing({
    regularPrice: (rest.regularPrice ?? existing.regularPrice) as number,
    sellingPrice: (rest.sellingPrice ?? existing.sellingPrice) as number,
    offerPrice: (rest.offerPrice ?? existing.offerPrice) as number | null | undefined,
    offerStart: offerStart !== undefined ? offerStart : undefined,
    offerEnd: offerEnd !== undefined ? offerEnd : undefined,
    isFree: (rest.isFree ?? existing.isFree) as boolean,
  });

  const batch = db.batch();
  const nextIncludedQuizIds = rest.includedQuizIds ?? existing.includedQuizIds;
  const nextIncludedPracticeTestIds = rest.includedPracticeTestIds ?? existing.includedPracticeTestIds;
  const nextIsRecommended = rest.isRecommended ?? existing.isRecommended;
  const nextName = rest.name ?? existing.name;
  await validatePackageRefsAndClearSiblingRecommended(
    existing.certificationId,
    nextName,
    nextIncludedQuizIds,
    nextIncludedPracticeTestIds,
    nextIsRecommended,
    packageId,
    batch
  );

  const update: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
  if (offerStart !== undefined) update.offerStart = offerStart ? Timestamp.fromDate(new Date(offerStart)) : null;
  if (offerEnd !== undefined) update.offerEnd = offerEnd ? Timestamp.fromDate(new Date(offerEnd)) : null;
  // Keep the bridge fields in sync whenever either price changes.
  const nextRegular = (rest.regularPrice ?? existing.regularPrice) as number;
  const nextSelling = (rest.sellingPrice ?? existing.sellingPrice) as number;
  if (rest.regularPrice !== undefined || rest.sellingPrice !== undefined) {
    update.price = nextSelling;
    update.originalPrice = nextRegular > nextSelling ? nextRegular : null;
  }

  batch.update(ref, update);
  await batch.commit();

  const diffs = diffFields(existing, update);
  await writeAdminLog({
    performedBy: uid,
    action: 'updatePackage',
    targetType: 'package',
    targetId: packageId,
    description: `Updated package "${existing.name}"${diffs.length ? ` (${diffs.map((d) => d.field).join(', ')})` : ''}`,
    previousValue: Object.fromEntries(diffs.map((d) => [d.field, d.from])),
    newValue: Object.fromEntries(diffs.map((d) => [d.field, d.to])),
  });
  return { success: true };
}

const packageIdSchema = z.object({ packageId: z.string().min(1) });

async function deletePackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');

  // "If a package is already referenced by historical data, do not
  // physically delete it. Archive it." - every purchase fanned out from
  // buying this package (or a coincidental individual purchase of the same
  // items) tags sourcePackageId; a single equality-filter existence check.
  const referenced = await db.collection('purchases').where('sourcePackageId', '==', parsed.data.packageId).limit(1).get();
  if (!referenced.empty) {
    throw Err.failedPrecondition('This package has historical purchase records; archive it instead of deleting');
  }

  await ref.delete();
  await writeAdminLog({
    performedBy: uid,
    action: 'deletePackage',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Deleted package "${snap.data()?.name}"`,
  });
  return { success: true };
}

async function archivePackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;

  await ref.update({ status: 'archived', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'archivePackage',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Archived package "${existing.name}"`,
    previousValue: { status: existing.status },
    newValue: { status: 'archived' },
  });
  return { success: true };
}

async function restorePackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;
  if (existing.status !== 'archived') throw Err.failedPrecondition('Only an archived package can be restored');

  await ref.update({ status: 'draft', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'restorePackage',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Restored package "${existing.name}" to Draft`,
    previousValue: { status: 'archived' },
    newValue: { status: 'draft' },
  });
  return { success: true };
}

async function publishPackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const pkg = snap.data()!;

  const certSnap = await db.collection('certifications').doc(pkg.certificationId).get();
  if (!certSnap.exists || certSnap.data()?.status !== 'published') {
    throw Err.failedPrecondition('Unpublished certification cannot expose a published package; publish the certification first');
  }
  const hasEntitlement = (pkg.includedQuizIds?.length ?? 0) > 0 || (pkg.includedPracticeTestIds?.length ?? 0) > 0;
  if (!hasEntitlement) throw Err.failedPrecondition('This package has no included quiz/practice test, cannot publish without a valid entitlement');
  if (!pkg.isFree && (pkg.sellingPrice ?? 0) <= 0) throw Err.failedPrecondition('This package has no valid selling price; mark it Free or set a price before publishing');

  // Precise accessible-question-count check against the actual referenced
  // banks, run once here at publish time (item 9's "Accessible question
  // count cannot exceed eligible published questions").
  if (pkg.practiceAccessEnabled && (pkg.accessibleQuestionCount ?? 0) > 0) {
    const testSnaps = pkg.includedPracticeTestIds?.length
      ? await db.getAll(...(pkg.includedPracticeTestIds as string[]).map((id) => db.collection('practiceTests').doc(id)))
      : [];
    const eligibleTotal = testSnaps.reduce((sum, s) => sum + ((s.data()?.totalQuestions as number) ?? 0), 0);
    if (pkg.accessibleQuestionCount > eligibleTotal) {
      throw Err.failedPrecondition(`Accessible question count (${pkg.accessibleQuestionCount}) exceeds the referenced bank(s)' actual published questions (${eligibleTotal})`);
    }
  }

  await ref.update({ status: 'published', isPublished: true, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'publishPackage',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Published package "${pkg.name}"`,
    previousValue: { status: pkg.status },
    newValue: { status: 'published' },
  });
  return { success: true };
}

async function unpublishPackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;

  await ref.update({ status: 'unpublished', isPublished: false, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'unpublishPackage',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Unpublished package "${existing.name}"`,
    previousValue: { status: existing.status },
    newValue: { status: 'unpublished' },
  });
  return { success: true };
}

async function duplicatePackage(uid: string, body: unknown) {
  const parsed = packageIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;

  const now = FieldValue.serverTimestamp();
  const newRef = db.collection('packages').doc();
  await newRef.set({
    ...existing,
    name: `${existing.name} (Copy)`,
    isRecommended: false, // never silently duplicate the Recommended flag onto a second package
    status: 'draft',
    isPublished: false,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await writeAdminLog({
    performedBy: uid,
    action: 'duplicatePackage',
    targetType: 'package',
    targetId: newRef.id,
    description: `Duplicated package "${existing.name}" as a new draft`,
  });
  return { packageId: newRef.id };
}

const cancelOfferSchema = z.object({ packageId: z.string().min(1), reason: z.string().trim().max(500).optional() });

async function cancelOffer(uid: string, body: unknown) {
  const parsed = cancelOfferSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('packages').doc(parsed.data.packageId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Package not found');
  const existing = snap.data()!;
  if (!existing.offerPrice || !existing.offerStart || !existing.offerEnd) throw Err.failedPrecondition('This package has no scheduled offer to cancel');

  await ref.update({ offerCancelledAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'cancelOffer',
    targetType: 'package',
    targetId: parsed.data.packageId,
    description: `Cancelled the scheduled offer on "${existing.name}"${parsed.data.reason ? `: ${parsed.data.reason}` : ''}`,
    reason: parsed.data.reason,
  });
  return { success: true };
}

const listPackagesAdminSchema = z.object({ certificationId: z.string().min(1).optional() });

async function listPackagesAdmin(body: unknown) {
  const parsed = listPackagesAdminSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  // Filtered-by-certification case is an equality-only query (no orderBy
  // chained onto it - that combination needs a composite index this repo
  // doesn't provision); sorted in memory instead, same convention as
  // api/checkout.ts's monthly-referral-cap count.
  const snap = parsed.data.certificationId
    ? await db.collection('packages').where('certificationId', '==', parsed.data.certificationId).get()
    : await db.collection('packages').orderBy('displayOrder').get();
  const packages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (parsed.data.certificationId) packages.sort((a, b) => ((a as { displayOrder?: number }).displayOrder ?? 0) - ((b as { displayOrder?: number }).displayOrder ?? 0));
  return { packages };
}

// ---------------------------------------------------------------------------
// Audit history - reuses the existing adminLogs collection/writeAdminLog
// helper (item 19), rather than a parallel audit table.
// ---------------------------------------------------------------------------

async function getAuditHistoryForCertification(body: unknown) {
  const parsed = certificationIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { certificationId } = parsed.data;

  // adminLogs has no certificationId field of its own for a package-level
  // entry - package ids under this certification are looked up first, then
  // both queries (targetId == certificationId, targetId in packageIds) run
  // and are merged/sorted in memory (Firestore has no native OR across two
  // different fields' equality here).
  const packagesSnap = await db.collection('packages').where('certificationId', '==', certificationId).get();
  const packageIds = packagesSnap.docs.map((d) => d.id);

  const certLogsSnap = await db.collection('adminLogs').where('targetId', '==', certificationId).get();
  const packageLogsSnaps =
    packageIds.length > 0
      ? await Promise.all(packageIds.map((id) => db.collection('adminLogs').where('targetId', '==', id).get()))
      : [];

  const entries = [
    ...certLogsSnap.docs,
    ...packageLogsSnaps.flatMap((s) => s.docs),
  ].map((d) => ({ id: d.id, ...d.data() }));
  entries.sort((a, b) => ((b as { createdAt?: Timestamp }).createdAt?.toMillis?.() ?? 0) - ((a as { createdAt?: Timestamp }).createdAt?.toMillis?.() ?? 0));
  return { entries };
}

// --- Creator / Content Partnership (Phase 4b), staff-facing -------------
// In the pilot every action here is admin-only (see requireAdmin). A
// dedicated content_reviewer / content_publisher role is added in 4b-2
// alongside the review + publish workflow.
const CREATOR_ROLES = ['course_creator', 'practice_test_creator', 'mock_test_creator', 'reviewer'] as const;
const CREATOR_AGREEMENT_VERSION = '2026-09-04';

async function listCreatorApplications(data: unknown) {
  const status = (data as { status?: string })?.status;
  let q: FirebaseFirestore.Query = db.collection('partnerRoles');
  if (status && ['APPLIED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)) {
    q = q.where('status', '==', status);
  }
  const snap = await q.limit(300).get();
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const r = d.data();
      const p = (await db.collection('partners').doc(r.partnerId as string).get()).data();
      return {
        id: d.id,
        partnerId: r.partnerId as string,
        partnerName: (p?.displayName as string) ?? (r.partnerId as string),
        role: r.role as string,
        status: r.status as string,
        subjectExpertise: (r.subjectExpertise as string[]) ?? [],
        qualifications: (r.qualifications as string | null) ?? null,
        sampleUrl: (r.sampleUrl as string | null) ?? null,
        reviewNote: (r.reviewNote as string | null) ?? null,
        appliedAt: r.appliedAt ?? null,
      };
    }),
  );
  rows.sort((a, b) => Number((b.appliedAt as { toMillis?: () => number })?.toMillis?.() ?? 0) - Number((a.appliedAt as { toMillis?: () => number })?.toMillis?.() ?? 0));
  return { applications: rows };
}

const reviewCreatorRoleSchema = z.object({
  roleDocId: z.string().trim().min(1),
  decision: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  note: z.string().trim().max(500).optional(),
});

async function reviewCreatorRole(uid: string, body: unknown) {
  const parsed = reviewCreatorRoleSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { roleDocId, decision, note } = parsed.data;
  const ref = db.collection('partnerRoles').doc(roleDocId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Role application not found');
  const cur = snap.data()!.status as string;

  const next =
    decision === 'approve'
      ? 'APPROVED'
      : decision === 'reject'
        ? 'REJECTED'
        : decision === 'suspend'
          ? 'SUSPENDED'
          : 'APPROVED'; // reinstate
  if (decision === 'approve' && !['APPLIED', 'UNDER_REVIEW'].includes(cur)) {
    throw Err.failedPrecondition(`Can only approve an applied role (this one is ${cur}).`);
  }
  if (decision === 'suspend' && cur !== 'APPROVED') throw Err.failedPrecondition('Only an approved role can be suspended.');
  if (decision === 'reinstate' && cur !== 'SUSPENDED') throw Err.failedPrecondition('Only a suspended role can be reinstated.');

  await ref.update({ status: next, reviewedBy: uid, reviewNote: note ?? null, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminLog({
    performedBy: uid,
    action: 'reviewCreatorRole',
    targetType: 'partnerRole',
    targetId: roleDocId,
    description: `${decision} creator role (${cur} -> ${next})`,
    previousValue: { status: cur },
    newValue: { status: next },
    reason: note,
  });
  return { status: next };
}

const saveCreatorContractSchema = z.object({
  contractId: z.string().trim().min(1).max(60).optional(),
  partnerId: z.string().trim().min(1),
  role: z.enum(CREATOR_ROLES),
  scopeType: z.enum(['certification', 'domain', 'series']),
  scopeRef: z.string().trim().max(120).optional(),
  compensationModel: z.enum(['FIXED', 'PER_ITEM', 'REVIEW']),
  rateMinor: z.number().int().positive(),
  deliverables: z.string().trim().min(4).max(2000),
  acceptanceCriteria: z.string().trim().min(4).max(2000),
  dueAt: z.string().datetime().optional(),
  ipAssignment: z.enum(['ASSIGN', 'LICENCE']).default('ASSIGN'),
  originalityDeclarationRequired: z.boolean().default(true),
  aiDisclosureRequired: z.boolean().default(true),
});

async function saveCreatorContract(uid: string, body: unknown) {
  const parsed = saveCreatorContractSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  // Rate sanity (mirror src/features/creator/lib/creatorRole.ts).
  if (d.compensationModel === 'FIXED' && d.rateMinor > 5_000_000) {
    throw Err.invalidArgument('A fixed fee over the configured ceiling needs finance sign-off.');
  }
  if (d.compensationModel !== 'FIXED' && d.rateMinor > 100_000) {
    throw Err.invalidArgument('Per-item rate is unusually high - confirm the value.');
  }

  // The partner must hold the matching APPROVED creator role.
  const roleSnap = await db.collection('partnerRoles').doc(`${d.partnerId}__${d.role}`).get();
  if (roleSnap.data()?.status !== 'APPROVED') {
    throw Err.failedPrecondition('That partner does not hold an approved role for this contract.');
  }

  const ref = d.contractId ? db.collection('creatorContracts').doc(d.contractId) : db.collection('creatorContracts').doc();
  const existing = d.contractId ? (await ref.get()).data() : null;
  const now = FieldValue.serverTimestamp();
  await ref.set(
    {
      partnerId: d.partnerId,
      role: d.role,
      productId: 'HELPCERTIFY',
      scopeType: d.scopeType,
      scopeRef: d.scopeRef ?? null,
      compensationModel: d.compensationModel,
      rateMinor: d.rateMinor,
      deliverables: d.deliverables,
      acceptanceCriteria: d.acceptanceCriteria,
      dueAt: d.dueAt ? Timestamp.fromDate(new Date(d.dueAt)) : null,
      ipAssignment: d.ipAssignment,
      originalityDeclarationRequired: d.originalityDeclarationRequired,
      aiDisclosureRequired: d.aiDisclosureRequired,
      agreementVersion: CREATOR_AGREEMENT_VERSION,
      status: 'ACTIVE',
      createdBy: existing?.createdBy ?? uid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    { merge: true },
  );
  await writeAdminLog({
    performedBy: uid,
    action: d.contractId ? 'updateCreatorContract' : 'createCreatorContract',
    targetType: 'creatorContract',
    targetId: ref.id,
    description: `${d.compensationModel} contract for ${d.partnerId} (${d.role})`,
  });
  return { contractId: ref.id };
}

const createCreatorAssignmentSchema = z.object({
  contractId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(160),
  targetType: z.enum(['quiz', 'practiceTest', 'questionBank', 'mockTest']),
  dueAt: z.string().datetime().optional(),
});

async function createCreatorAssignment(uid: string, body: unknown) {
  const parsed = createCreatorAssignmentSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const cSnap = await db.collection('creatorContracts').doc(d.contractId).get();
  const c = cSnap.data();
  if (!cSnap.exists || c?.status !== 'ACTIVE') throw Err.invalidArgument('Contract not found or not active');

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection('creatorAssignments').add({
    contractId: d.contractId,
    partnerId: c!.partnerId as string,
    productId: 'HELPCERTIFY',
    title: d.title,
    targetType: d.targetType,
    targetRef: null,
    status: 'ASSIGNED',
    acceptedItemCount: 0,
    dueAt: d.dueAt ? Timestamp.fromDate(new Date(d.dueAt)) : (c!.dueAt ?? null),
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  await writeAdminLog({
    performedBy: uid,
    action: 'createCreatorAssignment',
    targetType: 'creatorAssignment',
    targetId: ref.id,
    description: `Assigned "${d.title}" to ${c!.partnerId}`,
  });
  return { assignmentId: ref.id };
}

async function listCreatorContractsAdmin(data: unknown) {
  const partnerId = (data as { partnerId?: string })?.partnerId;
  let q: FirebaseFirestore.Query = db.collection('creatorContracts');
  if (partnerId) q = q.where('partnerId', '==', partnerId);
  const snap = await q.limit(200).get();
  return { contracts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function listCreatorAssignmentsAdmin(data: unknown) {
  const partnerId = (data as { partnerId?: string })?.partnerId;
  let q: FirebaseFirestore.Query = db.collection('creatorAssignments');
  if (partnerId) q = q.where('partnerId', '==', partnerId);
  const snap = await q.limit(300).get();
  return { assignments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

// --- Content review + publish (Phase 4b-2), staff-facing ----------------
// Separation of duties (PRD 9B/19): a creator can never review or publish
// their own work, and the publisher must differ from the reviewer. Enforced
// by uid here. Tested spec: src/features/creator/lib/reviewGuards.ts.

async function listContentSubmissionsAdmin(data: unknown) {
  const status = (data as { status?: string })?.status;
  let q: FirebaseFirestore.Query = db.collection('contentSubmissions');
  if (status) q = q.where('status', '==', status);
  const snap = await q.limit(300).get();
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const s = d.data();
      const p = (await db.collection('partners').doc(s.partnerId as string).get()).data();
      return {
        id: d.id,
        assignmentId: s.assignmentId as string,
        partnerId: s.partnerId as string,
        partnerName: (p?.displayName as string) ?? (s.partnerId as string),
        title: s.title as string,
        version: Number(s.version) || 1,
        itemCount: Number(s.itemCount) || 0,
        status: s.status as string,
        duplicateHits: s.automatedChecks?.duplicateHits?.length ?? 0,
        leakedPhraseHits: s.automatedChecks?.leakedPhraseHits?.length ?? 0,
        reviewerUid: (s.reviewerUid as string | null) ?? null,
        submittedAt: s.submittedAt ?? null,
      };
    }),
  );
  rows.sort((a, b) => Number((b.submittedAt as { toMillis?: () => number })?.toMillis?.() ?? 0) - Number((a.submittedAt as { toMillis?: () => number })?.toMillis?.() ?? 0));
  return { submissions: rows };
}

async function getContentSubmissionAdmin(data: unknown) {
  const parsed = z.object({ submissionId: z.string().trim().min(1) }).safeParse(data);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const snap = await db.collection('contentSubmissions').doc(parsed.data.submissionId).get();
  if (!snap.exists) throw Err.invalidArgument('Submission not found');
  const s = snap.data()!;
  const reviews = await db.collection('contentReviews').where('submissionId', '==', parsed.data.submissionId).limit(20).get();
  return {
    submission: { id: snap.id, ...s },
    reviews: reviews.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => Number((b as { decidedAt?: { toMillis?: () => number } }).decidedAt?.toMillis?.() ?? 0) - Number((a as { decidedAt?: { toMillis?: () => number } }).decidedAt?.toMillis?.() ?? 0)),
  };
}

const decideReviewSchema = z.object({
  submissionId: z.string().trim().min(1),
  decision: z.enum(['approve', 'changes', 'reject', 'flag_cleared', 'flag_upheld']),
  note: z.string().trim().max(2000).optional(),
  itemComments: z.array(z.object({ itemIndex: z.number().int().min(0), comment: z.string().trim().min(1).max(1000) })).max(200).default([]),
  acceptedItemCount: z.number().int().min(0).optional(),
  conflictOfInterestChecked: z.boolean().default(true),
});

async function decideContentReview(uid: string, body: unknown) {
  const parsed = decideReviewSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const ref = db.collection('contentSubmissions').doc(d.submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Submission not found');
  const s = snap.data()!;
  const cur = s.status as string;

  if (s.creatorUid === uid) throw Err.failedPrecondition('A creator cannot review their own submission.');

  const map: Record<string, { from: string[]; to: string }> = {
    approve: { from: ['SME_REVIEW'], to: 'APPROVED' },
    changes: { from: ['SME_REVIEW'], to: 'CHANGES_REQUIRED' },
    reject: { from: ['SME_REVIEW', 'FLAGGED'], to: 'REJECTED' },
    flag_cleared: { from: ['FLAGGED'], to: 'SME_REVIEW' },
    flag_upheld: { from: ['FLAGGED'], to: 'REJECTED' },
  };
  const t = map[d.decision];
  if (!t.from.includes(cur)) throw Err.failedPrecondition(`Cannot ${d.decision} a submission that is ${cur}.`);

  const now = FieldValue.serverTimestamp();
  const accepted =
    d.decision === 'approve'
      ? (d.acceptedItemCount ?? (Number(s.itemCount) || 0))
      : (Number(s.acceptedItemCount) || 0);

  const batch = db.batch();
  batch.update(ref, {
    status: t.to,
    reviewerUid: uid,
    reviewNote: d.note ?? null,
    acceptedItemCount: accepted,
    updatedAt: now,
  });
  batch.set(db.collection('contentReviews').doc(), {
    submissionId: d.submissionId,
    submissionVersion: Number(s.version) || 1,
    reviewerUid: uid,
    decision:
      d.decision === 'approve'
        ? 'APPROVE'
        : d.decision === 'changes'
          ? 'CHANGES_REQUIRED'
          : d.decision === 'reject'
            ? 'REJECT'
            : d.decision === 'flag_cleared'
              ? 'FLAG_CLEARED'
              : 'FLAG_UPHELD',
    itemComments: d.itemComments,
    note: d.note ?? null,
    conflictOfInterestChecked: d.conflictOfInterestChecked,
    decidedAt: now,
  });
  if (d.decision === 'flag_cleared' || d.decision === 'flag_upheld') {
    const cases = await db.collection('contentComplianceCases').where('submissionId', '==', d.submissionId).where('status', '==', 'OPEN').get();
    cases.docs.forEach((c) =>
      batch.update(c.ref, { status: d.decision === 'flag_cleared' ? 'DISMISSED' : 'UPHELD', resolvedBy: uid, resolvedAt: now }),
    );
  }
  await batch.commit();
  await writeAdminLog({
    performedBy: uid,
    action: 'decideContentReview',
    targetType: 'contentSubmission',
    targetId: d.submissionId,
    description: `${d.decision} (${cur} -> ${t.to})`,
    previousValue: { status: cur },
    newValue: { status: t.to },
    reason: d.note,
  });
  return { status: t.to };
}

async function publishContentSubmission(uid: string, body: unknown) {
  const parsed = z.object({ submissionId: z.string().trim().min(1), changeNote: z.string().trim().max(500).optional() }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('contentSubmissions').doc(parsed.data.submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Submission not found');
  const s = snap.data()!;
  if (s.status !== 'APPROVED') throw Err.failedPrecondition(`Only an APPROVED submission can be published (this is ${s.status}).`);
  if (s.creatorUid === uid) throw Err.failedPrecondition('A creator cannot publish their own submission.');
  if (s.reviewerUid === uid) throw Err.failedPrecondition('The reviewer cannot also publish - a second staff member must publish.');

  const aSnap = await db.collection('creatorAssignments').doc(s.assignmentId as string).get();
  const contractId = aSnap.data()?.contractId as string;
  const items = (s.items as { stem: string; options: string[]; answer: string; explanation: string }[]) ?? [];
  const acceptedCount = Number(s.acceptedItemCount) || items.length;
  const toPublish = items.slice(0, acceptedCount);

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  const itemIds: string[] = [];
  for (const item of toPublish) {
    const ciRef = db.collection('contentItems').doc();
    itemIds.push(ciRef.id);
    batch.set(ciRef, {
      productId: 'HELPCERTIFY',
      creatorContractId: contractId ?? null,
      submissionId: parsed.data.submissionId,
      partnerId: s.partnerId,
      assignmentId: s.assignmentId,
      currentVersion: 1,
      status: 'PUBLISHED',
      createdAt: now,
      updatedAt: now,
    });
    batch.set(ciRef.collection('versions').doc('1'), {
      version: 1,
      item,
      publishedBy: uid,
      publishedAt: now,
      changeNote: parsed.data.changeNote ?? null,
    });
  }
  batch.update(ref, { status: 'PUBLISHED', publishedBy: uid, contentItemIds: itemIds, updatedAt: now });
  batch.update(db.collection('creatorAssignments').doc(s.assignmentId as string), {
    status: 'ACCEPTED',
    acceptedItemCount: FieldValue.increment(toPublish.length),
    updatedAt: now,
  });

  // --- Earnings (Phase 4b-3). Separate liability from sales commission;
  // shares the payout batches. Held for a correction window, then released
  // by the same daily cron. Tested spec:
  // src/features/creator/lib/creatorEarnings.ts.
  const guardSnap = await db.collection('appSettings').doc('creatorEarnings').get();
  const holdDays = Number(guardSnap.data()?.holdDays) > 0 ? Math.floor(Number(guardSnap.data()!.holdDays)) : 14;
  const holdUntil = Timestamp.fromMillis(Date.now() + holdDays * 24 * 60 * 60 * 1000);
  const contract = contractId ? (await db.collection('creatorContracts').doc(contractId).get()).data() : null;

  const mkEarning = (
    id: string,
    partnerId: string,
    type: string,
    sourceType: string,
    sourceRef: string,
    qty: number,
    rateMinor: number,
  ) => {
    const gross = Math.max(0, Math.floor(rateMinor)) * Math.max(0, Math.floor(qty));
    if (gross <= 0) return;
    batch.set(
      db.collection('earnings').doc(id),
      {
        partnerId,
        productId: 'HELPCERTIFY',
        type,
        sourceType,
        sourceRef,
        contractId: contractId ?? null,
        qty,
        rateMinor: Math.floor(rateMinor),
        grossMinor: gross,
        deductionsMinor: 0,
        netMinor: gross,
        currency: 'INR',
        status: 'PENDING_HOLD',
        holdUntil,
        reversedMinor: 0,
        payoutBatchId: null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: false },
    );
    batch.set(db.collection('earningsLedger').doc(), {
      earningId: id,
      partnerId,
      fromStatus: null,
      toStatus: 'PENDING_HOLD',
      amountMinor: gross,
      reason: `${type} on publish of submission ${parsed.data.submissionId}`,
      actorId: uid,
      actorType: 'staff',
      createdAt: now,
    });
  };

  if (contract) {
    const model = contract.compensationModel as string;
    const rate = Number(contract.rateMinor) || 0;
    if (model === 'FIXED') {
      const fid = `assignment_${s.assignmentId}_${s.partnerId}`;
      if (!(await db.collection('earnings').doc(fid).get()).exists) {
        mkEarning(fid, s.partnerId as string, 'CREATOR_FIXED_FEE', 'assignment', s.assignmentId as string, 1, rate);
      }
    } else if (model === 'PER_ITEM') {
      mkEarning(
        `submission_${parsed.data.submissionId}_${s.partnerId}`,
        s.partnerId as string,
        'CREATOR_ITEM_FEE',
        'submission',
        parsed.data.submissionId,
        toPublish.length,
        rate,
      );
    }
  }

  // Reviewer fee - if the reviewer is a partner with an active REVIEW contract.
  if (s.reviewerUid) {
    const reviewerPartnerId = (await db.collection('users').doc(s.reviewerUid as string).get()).data()?.partnerId as
      | string
      | undefined;
    if (reviewerPartnerId) {
      const revContract = (await db.collection('creatorContracts').where('partnerId', '==', reviewerPartnerId).limit(20).get()).docs
        .map((d) => d.data())
        .find((c) => c.compensationModel === 'REVIEW' && c.status === 'ACTIVE');
      if (revContract) {
        mkEarning(
          `review_${parsed.data.submissionId}_${reviewerPartnerId}`,
          reviewerPartnerId,
          'REVIEWER_FEE',
          'review',
          parsed.data.submissionId,
          toPublish.length,
          Number(revContract.rateMinor) || 0,
        );
      }
    }
  }

  await batch.commit();

  await writeAdminLog({
    performedBy: uid,
    action: 'publishContentSubmission',
    targetType: 'contentSubmission',
    targetId: parsed.data.submissionId,
    description: `Published ${toPublish.length} item(s) from ${s.partnerId}`,
  });
  // Wiring the accepted items into a live quiz / practice test / question
  // bank is done through the existing admin import (createBatchedSeries /
  // question editor) - deliberately reused, not forked.
  return { status: 'PUBLISHED' as const, itemsPublished: toPublish.length };
}

async function listComplianceCases(data: unknown) {
  const status = (data as { status?: string })?.status ?? 'OPEN';
  const snap = await db.collection('contentComplianceCases').where('status', '==', status).limit(200).get();
  return { cases: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function resolveComplianceCase(uid: string, body: unknown) {
  const parsed = z
    .object({ caseId: z.string().trim().min(1), decision: z.enum(['uphold', 'dismiss']), quarantine: z.boolean().default(false) })
    .safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('contentComplianceCases').doc(parsed.data.caseId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Case not found');
  const c = snap.data()!;
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.update(ref, {
    status: parsed.data.decision === 'uphold' ? 'UPHELD' : 'DISMISSED',
    quarantined: parsed.data.quarantine,
    resolvedBy: uid,
    resolvedAt: now,
  });
  if (parsed.data.quarantine && c.contentItemId) {
    const ciSnap = await db.collection('contentItems').doc(c.contentItemId as string).get();
    const ci = ciSnap.data();
    batch.update(ciSnap.ref, { status: 'QUARANTINED', updatedAt: now });

    // Reverse the creator earning tied to the quarantined content. Not yet
    // paid -> REVERSED; already paid -> a RECOVERABLE ledger row (history
    // preserved). Reviewer fee is left intact.
    if (ci) {
      const candidates = [
        `submission_${ci.submissionId}_${ci.partnerId}`,
        `assignment_${ci.assignmentId}_${ci.partnerId}`,
      ];
      for (const eid of candidates) {
        const eSnap = await db.collection('earnings').doc(eid).get();
        if (!eSnap.exists) continue;
        const cur = eSnap.data()!.status as string;
        const net = Number(eSnap.data()!.netMinor) || 0;
        if (['PENDING_HOLD', 'APPROVED', 'PAYABLE'].includes(cur)) {
          batch.update(eSnap.ref, { status: 'REVERSED', reversedMinor: net, updatedAt: now });
          batch.set(db.collection('earningsLedger').doc(), {
            earningId: eid,
            partnerId: ci.partnerId,
            fromStatus: cur,
            toStatus: 'REVERSED',
            amountMinor: -net,
            reason: `Content quarantined (case ${parsed.data.caseId})`,
            actorId: uid,
            actorType: 'staff',
            createdAt: now,
          });
        } else if (['PROCESSING', 'PAID'].includes(cur)) {
          batch.set(db.collection('earningsLedger').doc(), {
            earningId: eid,
            partnerId: ci.partnerId,
            fromStatus: cur,
            toStatus: 'RECOVERABLE',
            amountMinor: -net,
            reason: `Content quarantined after payout (case ${parsed.data.caseId})`,
            actorId: uid,
            actorType: 'staff',
            createdAt: now,
          });
        }
      }
    }
  }
  await batch.commit();
  await writeAdminLog({
    performedBy: uid,
    action: 'resolveComplianceCase',
    targetType: 'contentComplianceCase',
    targetId: parsed.data.caseId,
    description: `${parsed.data.decision}${parsed.data.quarantine ? ' + quarantine' : ''}`,
  });
  return { status: parsed.data.decision === 'uphold' ? 'UPHELD' : 'DISMISSED' };
}

// ---------------------------------------------------------------------------
// Custom Exam Builder - a signed-in student's own uploaded question bank.
// Reuses this file's docx-parsing pipeline (fetchAndParse /
// writeQuestionsBatch / deleteSubcollection, all already defined above)
// unchanged, but every action here is reachable by any signed-in student,
// gated on owning the purchases/{uid}_customExamBuilder_capability
// entitlement instead of an admin role - see verifyAuthedUser's comment.
// Listing a student's own sets and reading one for taking are done as
// direct client Firestore reads (firestore.rules already gates those on
// ownerId), so only the write path (create/delete) and the score-computing
// path (submit, which needs the private answerKey a student can never read
// directly) need actions here.
// ---------------------------------------------------------------------------

const MAX_CUSTOM_EXAM_SETS_PER_USER = 20;

const createCustomExamSetSchema = z.object({
  title: z.string().trim().min(2).max(200),
  fileUrl: z.string().url(),
});

async function createCustomExamSet(uid: string, body: unknown) {
  const parsed = createCustomExamSetSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const purchaseSnap = await db.collection('purchases').doc(`${uid}_customExamBuilder_capability`).get();
  if (!purchaseSnap.exists) {
    throw Err.permissionDenied('Buy Custom Exam Builder to upload your own question bank');
  }

  const existing = await db.collection('customExamSets').where('ownerId', '==', uid).count().get();
  if (existing.data().count >= MAX_CUSTOM_EXAM_SETS_PER_USER) {
    throw Err.failedPrecondition(
      `You've reached the limit of ${MAX_CUSTOM_EXAM_SETS_PER_USER} custom exam sets. Delete one before adding another.`
    );
  }

  const {
    result: { valid, errors, warnings },
    detectedFormat,
  } = await fetchAndParse(d.fileUrl);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const setRef = db.collection('customExamSets').doc();
  await setRef.set({
    ownerId: uid,
    title: d.title,
    sourceFormat: detectedFormat,
    totalQuestions: valid.length,
    status: 'ready',
    parseWarnings: warnings,
    createdAt: now,
    updatedAt: now,
  });
  await writeQuestionsBatch(setRef, valid);

  return { setId: setRef.id, totalQuestions: valid.length, parseErrors: errors, parseWarnings: warnings };
}

const customExamSetIdSchema = z.object({ setId: z.string().trim().min(1) });

async function deleteMyCustomExamSet(uid: string, body: unknown) {
  const parsed = customExamSetIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('customExamSets').doc(parsed.data.setId);
  const snap = await ref.get();
  if (!snap.exists) return { success: true }; // already gone
  if (snap.data()!.ownerId !== uid) throw Err.permissionDenied();
  await deleteSubcollection(ref, 'questions');
  await ref.delete();
  return { success: true };
}

const submitCustomExamAttemptSchema = z.object({
  setId: z.string().trim().min(1),
  mode: z.enum(['practice', 'mock']),
  // questionId -> the option id the student selected. Unanswered questions
  // are simply absent from this map - counted wrong, never throws.
  answers: z.record(z.string()),
});

async function submitCustomExamAttempt(uid: string, body: unknown) {
  const parsed = submitCustomExamAttemptSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { setId, mode, answers } = parsed.data;

  const setRef = db.collection('customExamSets').doc(setId);
  const setSnap = await setRef.get();
  if (!setSnap.exists) throw Err.notFound('Custom exam set not found');
  if (setSnap.data()!.ownerId !== uid) throw Err.permissionDenied();

  const qSnap = await setRef.collection('questions').orderBy('order').get();
  const totalQuestions = qSnap.docs.length;
  const answerKeySnaps = await db.getAll(...qSnap.docs.map((q) => q.ref.collection('private').doc('answerKey')));
  let correctCount = 0;
  qSnap.docs.forEach((q, i) => {
    const correctOptionId = answerKeySnaps[i].data()?.correctOptionId;
    if (answers[q.id] && answers[q.id] === correctOptionId) correctCount += 1;
  });
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const attemptRef = db.collection('customExamAttempts').doc();
  await attemptRef.set({
    ownerId: uid,
    setId,
    mode,
    correctCount,
    totalQuestions,
    scorePercent,
    submittedAt: FieldValue.serverTimestamp(),
  });

  return { attemptId: attemptRef.id, correctCount, totalQuestions, scorePercent };
}

// ---------------------------------------------------------------------------
// Trainer / Mentored Learning - Phase 1A. A trainer owns training programs
// (trainingPrograms/{id}) and a learner roster (that doc's own
// learners/{learnerUid} subcollection, doc id = the learner's uid). Trainer
// is not a Role (see users/{uid}.trainerId, and src/types/models.ts's
// TrainerDoc comment) - every action below is reachable by any signed-in
// user (added to STUDENT_REACHABLE_ACTIONS below) and does its own
// requireActiveTrainer + ownership check internally, same shape as Custom
// Exam Builder's entitlement check above. "Assign a course" means
// referencing an existing quizzes/{id} or practiceTests/{id} doc - this
// codebase has no separate Course entity - and grants no access beyond
// what the learner's own purchase/entitlement already allows.
//
// programMemberships/{learnerUid}_{programId} is a small denormalized
// top-level collection (composite doc id, same convention as
// purchases/{uid}_{itemType}_{itemId}) that exists purely so a learner can
// find "which programs am I on" with a plain equality query instead of a
// Firestore collection-group query (which needs an explicit index this
// environment has no way to verify - see this session's Custom Exam
// Builder rules for the same testing limitation). It caches only identity/
// status fields, never program content, so it can't go stale - the actual
// title/description/assignedContent are always read fresh from
// trainingPrograms/{programId} at request time.
// ---------------------------------------------------------------------------

async function requireActiveTrainer(uid: string): Promise<{ trainerId: string }> {
  const userSnap = await db.collection('users').doc(uid).get();
  const trainerId = userSnap.data()?.trainerId as string | undefined;
  if (!trainerId) throw Err.permissionDenied('This account is not a trainer');
  const trainerSnap = await db.collection('trainers').doc(trainerId).get();
  if (trainerSnap.data()?.status !== 'ACTIVE') throw Err.permissionDenied('Trainer status is not active');
  return { trainerId };
}

async function requireOwnedProgram(trainerId: string, programId: string) {
  const ref = db.collection('trainingPrograms').doc(programId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Training program not found');
  const data = snap.data()!;
  if (data.trainerId !== trainerId) throw Err.permissionDenied();
  return { ref, data };
}

const createTrainingProgramSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(''),
});

async function createTrainingProgram(uid: string, body: unknown) {
  const parsed = createTrainingProgramSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);

  const now = FieldValue.serverTimestamp();
  const ref = db.collection('trainingPrograms').doc();
  await ref.set({
    trainerId,
    title: parsed.data.title,
    description: parsed.data.description,
    assignedContent: [],
    observerUids: [],
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return { programId: ref.id };
}

const updateTrainingProgramSchema = z.object({
  programId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

async function updateTrainingProgram(uid: string, body: unknown) {
  const parsed = updateTrainingProgramSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref } = await requireOwnedProgram(trainerId, parsed.data.programId);

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  await ref.update(update);
  return { success: true };
}

const programIdSchema = z.object({ programId: z.string().trim().min(1) });

async function archiveTrainingProgram(uid: string, body: unknown) {
  const parsed = programIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref } = await requireOwnedProgram(trainerId, parsed.data.programId);
  await ref.update({ status: 'ARCHIVED', updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

async function listMyTrainingPrograms(uid: string) {
  const { trainerId } = await requireActiveTrainer(uid);
  const snap = await db.collection('trainingPrograms').where('trainerId', '==', trainerId).orderBy('createdAt', 'desc').get();
  const programs = await Promise.all(
    snap.docs.map(async (d) => {
      const learnersSnap = await d.ref.collection('learners').get();
      const activeLearners = learnersSnap.docs.filter((l) => l.data().status !== 'REMOVED');
      return { id: d.id, ...d.data(), learnerCount: activeLearners.length };
    })
  );
  return { programs };
}

const addLearnerSchema = z.object({
  programId: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
});

async function addLearnerToProgram(uid: string, body: unknown) {
  const parsed = addLearnerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref: programRef } = await requireOwnedProgram(trainerId, parsed.data.programId);

  const userQuery = await db.collection('users').where('email', '==', parsed.data.email).limit(1).get();
  if (userQuery.empty) throw Err.invalidArgument('No HelpCertify account found with that email');
  const learnerDoc = userQuery.docs[0];
  const learnerUid = learnerDoc.id;

  const learnerRef = programRef.collection('learners').doc(learnerUid);
  const existing = await learnerRef.get();
  if (existing.exists && existing.data()!.status !== 'REMOVED') {
    throw Err.failedPrecondition('This learner is already on this program');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(learnerRef, {
    learnerUid,
    learnerName: (learnerDoc.data().name as string) ?? '',
    learnerEmail: parsed.data.email,
    status: 'INVITED',
    invitedAt: now,
    joinedAt: null,
  });
  batch.set(db.collection('programMemberships').doc(`${learnerUid}_${parsed.data.programId}`), {
    learnerUid,
    programId: parsed.data.programId,
    trainerId,
    status: 'INVITED',
    updatedAt: now,
  });
  await batch.commit();
  return { success: true };
}

const removeLearnerSchema = z.object({ programId: z.string().trim().min(1), learnerUid: z.string().trim().min(1) });

async function removeLearnerFromProgram(uid: string, body: unknown) {
  const parsed = removeLearnerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref: programRef } = await requireOwnedProgram(trainerId, parsed.data.programId);

  const batch = db.batch();
  batch.update(programRef.collection('learners').doc(parsed.data.learnerUid), { status: 'REMOVED' });
  batch.update(db.collection('programMemberships').doc(`${parsed.data.learnerUid}_${parsed.data.programId}`), {
    status: 'REMOVED',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { success: true };
}

const assignContentSchema = z.object({
  programId: z.string().trim().min(1),
  itemType: z.enum(['quiz', 'practiceTest']),
  itemId: z.string().trim().min(1),
});

async function assignContentToProgram(uid: string, body: unknown) {
  const parsed = assignContentSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref, data } = await requireOwnedProgram(trainerId, parsed.data.programId);

  const collectionName = parsed.data.itemType === 'quiz' ? 'quizzes' : 'practiceTests';
  const contentSnap = await db.collection(collectionName).doc(parsed.data.itemId).get();
  if (!contentSnap.exists) throw Err.invalidArgument('That content no longer exists');

  const current = (data.assignedContent as { itemType: string; itemId: string }[] | undefined) ?? [];
  if (current.some((c) => c.itemType === parsed.data.itemType && c.itemId === parsed.data.itemId)) {
    throw Err.failedPrecondition('This content is already assigned to the program');
  }

  await ref.update({
    assignedContent: FieldValue.arrayUnion({
      itemType: parsed.data.itemType,
      itemId: parsed.data.itemId,
      title: (contentSnap.data()!.title as string) ?? 'Untitled',
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { success: true };
}

async function unassignContentFromProgram(uid: string, body: unknown) {
  const parsed = assignContentSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { trainerId } = await requireActiveTrainer(uid);
  const { ref, data } = await requireOwnedProgram(trainerId, parsed.data.programId);

  const current = (data.assignedContent as { itemType: string; itemId: string; title: string }[] | undefined) ?? [];
  const toRemove = current.find((c) => c.itemType === parsed.data.itemType && c.itemId === parsed.data.itemId);
  if (!toRemove) return { success: true };

  await ref.update({ assignedContent: FieldValue.arrayRemove(toRemove), updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

// Learner-side: the whole of Phase 1A's learner-facing surface. Any
// signed-in user may call this (not gated on being a trainer) - it returns
// the programs where the caller has a non-removed programMemberships row,
// with each program's current title/description/assignedContent and its
// trainer's display name always read fresh (never denormalized/cached),
// plus the caller's own roster status (INVITED vs ACTIVE) on that program.
async function listMyTrainingProgramMemberships(uid: string) {
  const membershipSnap = await db.collection('programMemberships').where('learnerUid', '==', uid).get();
  const memberships = membershipSnap.docs
    .map((d) => d.data() as { programId: string; trainerId: string; status: string })
    .filter((m) => m.status !== 'REMOVED');
  if (memberships.length === 0) return { programs: [] };

  const programRefs = memberships.map((m) => db.collection('trainingPrograms').doc(m.programId));
  const trainerIds = [...new Set(memberships.map((m) => m.trainerId))];
  const trainerRefs = trainerIds.map((id) => db.collection('trainers').doc(id));
  const [programSnaps, trainerSnaps] = await Promise.all([db.getAll(...programRefs), db.getAll(...trainerRefs)]);

  const trainerNameById = new Map(trainerSnaps.map((s) => [s.id, (s.data()?.displayName as string) ?? 'Trainer']));

  const programs = memberships.map((m, i) => {
    const programSnap = programSnaps[i];
    const programData = programSnap.data();
    return {
      programId: m.programId,
      membershipStatus: m.status,
      trainerName: trainerNameById.get(m.trainerId) ?? 'Trainer',
      title: (programData?.title as string) ?? 'Untitled program',
      description: (programData?.description as string) ?? '',
      programStatus: (programData?.status as string) ?? 'ACTIVE',
      assignedContent: (programData?.assignedContent as { itemType: string; itemId: string; title: string }[]) ?? [],
    };
  });
  return { programs };
}

// ---------------------------------------------------------------------------
// Catalog Submissions - a Trainer or an approved Creator authors a full
// question bank (uploaded the same .docx way as an admin's own quiz or
// Custom Exam Builder) and submits it for admin review; once approved and
// published it becomes a real quizzes/{id} or practiceTests/{id} doc,
// indistinguishable from admin-authored content from that point on. This
// is the pipeline that actually produces live catalog content - unlike
// the older contentSubmissions/contentItems pipeline above, which only
// ever produces individually-reviewed questions with nowhere for them to
// go. Nothing is published without an explicit admin approve + publish
// step. Reuses fetchAndParse/writeQuestionsBatch unchanged.
// ---------------------------------------------------------------------------

async function requireCatalogAuthor(uid: string): Promise<{ authorType: 'trainer' | 'creator'; authorId: string }> {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();

  const trainerId = user?.trainerId as string | undefined;
  if (trainerId) {
    const trainerSnap = await db.collection('trainers').doc(trainerId).get();
    if (trainerSnap.data()?.status === 'ACTIVE') return { authorType: 'trainer', authorId: trainerId };
  }

  const partnerId = user?.partnerId as string | undefined;
  if (partnerId) {
    const roleIds = ['course_creator', 'practice_test_creator', 'mock_test_creator'].map((r) => `${partnerId}__${r}`);
    const roleSnaps = await db.getAll(...roleIds.map((id) => db.collection('partnerRoles').doc(id)));
    if (roleSnaps.some((s) => s.data()?.status === 'APPROVED')) return { authorType: 'creator', authorId: partnerId };
  }

  throw Err.permissionDenied('This account is not an approved Trainer or Creator');
}

const createCatalogSubmissionSchema = z.object({
  itemType: z.enum(['quiz', 'practiceTest']),
  title: z.string().trim().min(2).max(200),
  category: z.string().trim().min(1).max(100).default('Other'),
  skillLevel: z.enum(SKILL_LEVELS).default('Foundation'),
  description: z.string().trim().max(5000).default(''),
  suggestedPrice: z.number().int().min(0).default(0),
  currency: z.enum(['INR', 'USD']).default('INR'),
  fileUrl: z.string().url(),
});

async function createCatalogSubmission(uid: string, body: unknown) {
  const parsed = createCatalogSubmissionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const { authorType, authorId } = await requireCatalogAuthor(uid);

  const {
    result: { valid, errors, warnings },
    detectedFormat,
  } = await fetchAndParse(d.fileUrl);
  if (valid.length === 0) throw Err.invalidArgument('No questions could be parsed from this file', errors);

  const now = FieldValue.serverTimestamp();
  const ref = db.collection('catalogSubmissions').doc();
  await ref.set({
    authorUid: uid,
    authorType,
    authorId,
    itemType: d.itemType,
    title: d.title,
    category: d.category,
    skillLevel: d.skillLevel,
    description: d.description,
    suggestedPrice: d.suggestedPrice,
    currency: d.currency,
    sourceFormat: detectedFormat,
    totalQuestions: valid.length,
    parseWarnings: warnings,
    status: 'PENDING_REVIEW',
    reviewerUid: null,
    reviewNote: null,
    publishedItemId: null,
    createdAt: now,
    updatedAt: now,
  });
  await writeQuestionsBatch(ref, valid);

  return { submissionId: ref.id, totalQuestions: valid.length, parseErrors: errors, parseWarnings: warnings };
}

async function listMyCatalogSubmissions(uid: string) {
  const snap = await db.collection('catalogSubmissions').where('authorUid', '==', uid).orderBy('createdAt', 'desc').get();
  return { submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

const submissionIdSchema = z.object({ submissionId: z.string().trim().min(1) });

async function withdrawCatalogSubmission(uid: string, body: unknown) {
  const parsed = submissionIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('catalogSubmissions').doc(parsed.data.submissionId);
  const snap = await ref.get();
  if (!snap.exists) return { success: true };
  const s = snap.data()!;
  if (s.authorUid !== uid) throw Err.permissionDenied();
  if (!['PENDING_REVIEW', 'CHANGES_REQUESTED'].includes(s.status as string)) {
    throw Err.failedPrecondition(`Cannot withdraw a submission that is ${String(s.status).toLowerCase()}.`);
  }
  await deleteSubcollection(ref, 'questions');
  await ref.delete();
  return { success: true };
}

async function listCatalogSubmissionsAdmin(data: unknown) {
  const status = (data as { status?: string })?.status;
  let q = db.collection('catalogSubmissions').orderBy('createdAt', 'desc') as FirebaseFirestore.Query;
  if (status) q = q.where('status', '==', status);
  const snap = await q.get();
  return { submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

const decideCatalogSubmissionSchema = z.object({
  submissionId: z.string().trim().min(1),
  decision: z.enum(['approve', 'changes', 'reject']),
  note: z.string().trim().max(2000).optional(),
});

async function decideCatalogSubmission(uid: string, body: unknown) {
  const parsed = decideCatalogSubmissionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { submissionId, decision, note } = parsed.data;

  const ref = db.collection('catalogSubmissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Submission not found');
  const cur = snap.data()!.status as string;

  const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
    approve: { from: ['PENDING_REVIEW', 'CHANGES_REQUESTED'], to: 'APPROVED' },
    changes: { from: ['PENDING_REVIEW'], to: 'CHANGES_REQUESTED' },
    reject: { from: ['PENDING_REVIEW', 'CHANGES_REQUESTED'], to: 'REJECTED' },
  };
  const t = TRANSITIONS[decision];
  if (!t.from.includes(cur)) throw Err.failedPrecondition(`Cannot ${decision} a submission that is ${cur}.`);

  await ref.update({
    status: t.to,
    reviewerUid: uid,
    reviewNote: note ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAdminLog({
    performedBy: uid,
    action: 'decideCatalogSubmission',
    targetType: 'catalogSubmission',
    targetId: submissionId,
    description: `${decision} (now ${t.to})${note ? `: ${note}` : ''}`,
  });
  return { status: t.to };
}

const publishCatalogSubmissionSchema = z.object({
  submissionId: z.string().trim().min(1),
  price: z.number().int().min(0),
  originalPrice: z.number().int().min(0).nullable().optional(),
  accessPeriodDays: z.number().int().min(0).max(3650).default(0),
  passMarkPercent: z.number().int().min(1).max(100).default(60),
  // Quiz-only. Practice tests get a wide-open availability window since
  // the author never set one - an admin can narrow it later via the
  // existing updatePracticeTest action, same as any other practice test.
  durationMinutes: z.number().int().min(1).max(600).default(60),
});

async function publishCatalogSubmission(uid: string, body: unknown) {
  const parsed = publishCatalogSubmissionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const ref = db.collection('catalogSubmissions').doc(d.submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Submission not found');
  const s = snap.data()!;
  if (s.status !== 'APPROVED') throw Err.failedPrecondition('Only an approved submission can be published');

  const qSnap = await ref.collection('questions').orderBy('order').get();
  const answerKeySnaps = await db.getAll(...qSnap.docs.map((q) => q.ref.collection('private').doc('answerKey')));
  const questions: ParsedQuestion[] = qSnap.docs.map((q, i) => ({
    order: q.data().order as number,
    questionText: q.data().questionText as string,
    options: q.data().options as ParsedOption[],
    correctOptionId: answerKeySnaps[i].data()?.correctOptionId as string,
  }));

  const now = FieldValue.serverTimestamp();
  let publishedItemId: string;

  if (s.itemType === 'quiz') {
    const quizRef = db.collection('quizzes').doc();
    await quizRef.set({
      title: s.title,
      code: generateCode(),
      sourceFormat: s.sourceFormat,
      totalQuestions: s.totalQuestions,
      enforceSequentialNav: false,
      showImmediateResult: false,
      showFinalScore: true,
      durationType: 'overall',
      durationMinutes: d.durationMinutes,
      scheduledStart: null,
      isPublished: true,
      antiCheat: { blockAltTab: true },
      price: d.price,
      originalPrice: d.originalPrice ?? null,
      currency: s.currency,
      category: s.category,
      skillLevel: s.skillLevel,
      description: s.description,
      ratingAvg: 0,
      ratingCount: 0,
      passMarkPercent: d.passMarkPercent,
      previewQuestionCount: 5,
      maxAttempts: 1,
      accessPeriodDays: d.accessPeriodDays,
      createdBy: s.authorUid,
      createdAt: now,
      updatedAt: now,
    });
    await writeQuestionsBatch(quizRef, questions);
    publishedItemId = quizRef.id;
  } else {
    const testRef = db.collection('practiceTests').doc();
    const tenYearsFromNow = Timestamp.fromMillis(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    await testRef.set({
      title: s.title,
      availableFrom: now,
      availableUntil: tenYearsFromNow,
      durationPerSessionMinutes: null,
      defaultInitialBatchSize: Math.min(50, s.totalQuestions),
      sourceFormat: s.sourceFormat,
      totalQuestions: s.totalQuestions,
      price: d.price,
      originalPrice: d.originalPrice ?? null,
      currency: s.currency,
      category: s.category,
      skillLevel: s.skillLevel,
      description: s.description,
      ratingAvg: 0,
      ratingCount: 0,
      previewQuestionCount: 5,
      accessPeriodDays: d.accessPeriodDays,
      createdBy: s.authorUid,
      createdAt: now,
      updatedAt: now,
    });
    await writeQuestionsBatch(testRef, questions);
    publishedItemId = testRef.id;
  }

  await ref.update({ status: 'PUBLISHED', publishedItemId, updatedAt: now });
  await writeAdminLog({
    performedBy: uid,
    action: 'publishCatalogSubmission',
    targetType: s.itemType as string,
    targetId: publishedItemId,
    description: `Published "${s.title}" from a ${s.authorType} submission (${s.totalQuestions} questions)`,
  });

  return { publishedItemId, itemType: s.itemType as 'quiz' | 'practiceTest' };
}

// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };

    // Every action in this file is admin-only except the Custom Exam
    // Builder ones (gate on that student's own
    // purchases/{uid}_customExamBuilder_capability entitlement instead)
    // and the Trainer / Mentored Learning ones (gate on
    // requireActiveTrainer / a learner's own programMemberships row
    // instead) - both checked inside the function itself, not here.
    const STUDENT_REACHABLE_ACTIONS = new Set([
      'createCustomExamSet',
      'deleteMyCustomExamSet',
      'submitCustomExamAttempt',
      'createTrainingProgram',
      'updateTrainingProgram',
      'archiveTrainingProgram',
      'listMyTrainingPrograms',
      'addLearnerToProgram',
      'removeLearnerFromProgram',
      'assignContentToProgram',
      'unassignContentFromProgram',
      'listMyTrainingProgramMemberships',
      'createCatalogSubmission',
      'listMyCatalogSubmissions',
      'withdrawCatalogSubmission',
    ]);
    const { uid } = STUDENT_REACHABLE_ACTIONS.has(String(action))
      ? await verifyAuthedUser(req)
      : await requireAdmin(req);

    switch (action) {
      case 'createCustomExamSet':
        res.status(200).json(await createCustomExamSet(uid, data));
        return;
      case 'deleteMyCustomExamSet':
        res.status(200).json(await deleteMyCustomExamSet(uid, data));
        return;
      case 'submitCustomExamAttempt':
        res.status(200).json(await submitCustomExamAttempt(uid, data));
        return;
      case 'createTrainingProgram':
        res.status(200).json(await createTrainingProgram(uid, data));
        return;
      case 'updateTrainingProgram':
        res.status(200).json(await updateTrainingProgram(uid, data));
        return;
      case 'archiveTrainingProgram':
        res.status(200).json(await archiveTrainingProgram(uid, data));
        return;
      case 'listMyTrainingPrograms':
        res.status(200).json(await listMyTrainingPrograms(uid));
        return;
      case 'addLearnerToProgram':
        res.status(200).json(await addLearnerToProgram(uid, data));
        return;
      case 'removeLearnerFromProgram':
        res.status(200).json(await removeLearnerFromProgram(uid, data));
        return;
      case 'assignContentToProgram':
        res.status(200).json(await assignContentToProgram(uid, data));
        return;
      case 'unassignContentFromProgram':
        res.status(200).json(await unassignContentFromProgram(uid, data));
        return;
      case 'listMyTrainingProgramMemberships':
        res.status(200).json(await listMyTrainingProgramMemberships(uid));
        return;
      case 'createCatalogSubmission':
        res.status(200).json(await createCatalogSubmission(uid, data));
        return;
      case 'listMyCatalogSubmissions':
        res.status(200).json(await listMyCatalogSubmissions(uid));
        return;
      case 'withdrawCatalogSubmission':
        res.status(200).json(await withdrawCatalogSubmission(uid, data));
        return;
      case 'listCatalogSubmissionsAdmin':
        res.status(200).json(await listCatalogSubmissionsAdmin(data));
        return;
      case 'decideCatalogSubmission':
        res.status(200).json(await decideCatalogSubmission(uid, data));
        return;
      case 'publishCatalogSubmission':
        res.status(200).json(await publishCatalogSubmission(uid, data));
        return;
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
      case 'updateQuizQuestion':
        res.status(200).json(await updateQuizQuestion(uid, data));
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
      case 'updatePracticeTestQuestion':
        res.status(200).json(await updatePracticeTestQuestion(uid, data));
        return;
      case 'createBatchedSeries':
        res.status(200).json(await createBatchedSeries(uid, data));
        return;
      case 'createCertification':
        res.status(200).json(await createCertification(uid, data));
        return;
      case 'updateCertification':
        res.status(200).json(await updateCertification(uid, data));
        return;
      case 'deleteCertification':
        res.status(200).json(await deleteCertification(uid, data));
        return;
      case 'publishCertification':
        res.status(200).json(await publishCertification(uid, data));
        return;
      case 'unpublishCertification':
        res.status(200).json(await unpublishCertification(uid, data));
        return;
      case 'archiveCertification':
        res.status(200).json(await archiveCertification(uid, data));
        return;
      case 'restoreCertification':
        res.status(200).json(await restoreCertification(uid, data));
        return;
      case 'duplicateCertification':
        res.status(200).json(await duplicateCertification(uid, data));
        return;
      case 'listCertificationsAdmin':
        res.status(200).json(await listCertificationsAdmin());
        return;
      case 'saveContentVersion':
        res.status(200).json(await saveContentVersion(uid, data));
        return;
      case 'deleteContentVersion':
        res.status(200).json(await deleteContentVersion(uid, data));
        return;
      case 'getBankDomainCounts':
        res.status(200).json(await getBankDomainCounts(data));
        return;
      case 'saveMockBlueprint':
        res.status(200).json(await saveMockBlueprint(uid, data));
        return;
      case 'deleteMockBlueprint':
        res.status(200).json(await deleteMockBlueprint(uid, data));
        return;
      case 'createPackage':
        res.status(200).json(await createPackage(uid, data));
        return;
      case 'updatePackage':
        res.status(200).json(await updatePackage(uid, data));
        return;
      case 'deletePackage':
        res.status(200).json(await deletePackage(uid, data));
        return;
      case 'archivePackage':
        res.status(200).json(await archivePackage(uid, data));
        return;
      case 'restorePackage':
        res.status(200).json(await restorePackage(uid, data));
        return;
      case 'publishPackage':
        res.status(200).json(await publishPackage(uid, data));
        return;
      case 'unpublishPackage':
        res.status(200).json(await unpublishPackage(uid, data));
        return;
      case 'duplicatePackage':
        res.status(200).json(await duplicatePackage(uid, data));
        return;
      case 'cancelOffer':
        res.status(200).json(await cancelOffer(uid, data));
        return;
      case 'listPackagesAdmin':
        res.status(200).json(await listPackagesAdmin(data));
        return;
      case 'getAuditHistoryForCertification':
        res.status(200).json(await getAuditHistoryForCertification(data));
        return;
      // --- Creator / Content Partnership (Phase 4b) ---
      case 'listCreatorApplications':
        res.status(200).json(await listCreatorApplications(data));
        return;
      case 'reviewCreatorRole':
        res.status(200).json(await reviewCreatorRole(uid, data));
        return;
      case 'saveCreatorContract':
        res.status(200).json(await saveCreatorContract(uid, data));
        return;
      case 'createCreatorAssignment':
        res.status(200).json(await createCreatorAssignment(uid, data));
        return;
      case 'listCreatorContractsAdmin':
        res.status(200).json(await listCreatorContractsAdmin(data));
        return;
      case 'listCreatorAssignmentsAdmin':
        res.status(200).json(await listCreatorAssignmentsAdmin(data));
        return;
      case 'listContentSubmissionsAdmin':
        res.status(200).json(await listContentSubmissionsAdmin(data));
        return;
      case 'getContentSubmissionAdmin':
        res.status(200).json(await getContentSubmissionAdmin(data));
        return;
      case 'decideContentReview':
        res.status(200).json(await decideContentReview(uid, data));
        return;
      case 'publishContentSubmission':
        res.status(200).json(await publishContentSubmission(uid, data));
        return;
      case 'listComplianceCases':
        res.status(200).json(await listComplianceCases(data));
        return;
      case 'resolveComplianceCase':
        res.status(200).json(await resolveComplianceCase(uid, data));
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
