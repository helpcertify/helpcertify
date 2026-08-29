import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Ranked results (admin) + a student's own history/dashboard, plus learner
// completion certificates (issuance, listing, PDF download, public
// verification) — folded in here rather than a 13th api/*.ts file (Vercel's
// Hobby plan caps a deployment at 12 Serverless Functions, and this repo is
// already at that limit), and this file already owns "a student's own
// attempt history," which a certificate is directly derived from.
// Self-contained — see api/auth.ts's header comment for why.

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

type Role = 'student' | 'admin';

async function requireUser(req: VercelRequest): Promise<{ uid: string; role: Role }> {
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
  return { uid: decoded.uid, role: (user.role as Role | undefined) ?? 'student' };
}

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

// Firestore's DocumentData is an index-signature type (`any`-valued fields),
// so `d.data()` fields are accessed directly rather than through a named
// interface — matches the rest of this project's Vercel functions (e.g.
// quiz-session.ts reads `attempt.status`, `attempt.quizId` etc. straight off
// `.data()!` without a per-collection type).
function toAttemptRow(d: FirebaseFirestore.QueryDocumentSnapshot): { id: string } & Record<string, any> {
  return { id: d.id, ...d.data() };
}

const listForQuizSchema = z.object({ quizId: z.string().min(1) });

async function listResultsForQuiz(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = listForQuizSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId } = parsed.data;

  const snap = await db.collection('quizAttempts').where('quizId', '==', quizId).orderBy('marks', 'desc').get();
  const rows = snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status));

  return { attempts: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
}

async function listResultsForStudent(uid: string) {
  const snap = await db
    .collection('quizAttempts')
    .where('userId', '==', uid)
    .orderBy('submittedAt', 'desc')
    .get();
  return { attempts: snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status)) };
}

const quizIdSchema = z.object({ quizId: z.string().min(1) });

async function getMyResultForQuiz(uid: string, body: unknown) {
  const parsed = quizIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const snap = await db.collection('quizAttempts').where('quizId', '==', parsed.data.quizId).orderBy('marks', 'desc').get();
  const rows = snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status));
  const index = rows.findIndex((r) => r.userId === uid);
  if (index === -1) throw Err.notFound('No attempt found for this quiz');

  return { attempt: { ...rows[index], rank: index + 1 } };
}

const deleteAttemptSchema = z.object({ attemptId: z.string().min(1) });

async function deleteAttempt(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = deleteAttemptSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const ref = db.collection('quizAttempts').doc(parsed.data.attemptId);
  const answersSnap = await ref.collection('answers').get();
  const batch = db.batch();
  answersSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Certificates — one per eligible, completed quiz attempt or fully-answered
// practice test. Every field the PDF renders is snapshotted here from
// server-trusted sources at issuance time (the graded attempt/progress doc,
// the quiz/practiceTest doc, and the caller's own users/{uid}.name) — never
// accepted from the client. Doc id is a Firestore auto-id: not a
// predictable/sequential value, used directly as the public Certificate ID
// in the PDF, the download filename, and the /verify/:certificateId URL.
// ---------------------------------------------------------------------------

const HELPCERTIFY_OPERATOR = 'IndyaBees';

// Duplicated from src/features/students/lib/certificateEligibility.ts's
// tested canonical version (no cross-file imports across api/*.ts).
function isQuizAttemptCertificateEligible(status: string, correctCount: number, totalQuestions: number, passMarkPercent: number): boolean {
  if (status !== 'submitted' && status !== 'auto_submitted') return false;
  if (totalQuestions <= 0) return false;
  return (correctCount / totalQuestions) * 100 >= passMarkPercent;
}
function isPracticeTestCertificateEligible(answeredCount: number, totalQuestions: number): boolean {
  return totalQuestions > 0 && answeredCount >= totalQuestions;
}
function buildSourceAttemptKey(learnerUid: string, sourceType: 'quiz' | 'practiceTest', sourceId: string, attemptId: string): string {
  return `${learnerUid}_${sourceType}_${sourceId}_${attemptId}`;
}

async function logCertificateAccess(certificateId: string, learnerUid: string | null, action: 'view' | 'download' | 'verify') {
  await db.collection('certificateAccessLogs').add({ certificateId, learnerUid, action, createdAt: Timestamp.now() });
}

const issueCertificateSchema = z.object({
  sourceType: z.enum(['quiz', 'practiceTest']),
  sourceId: z.string().min(1),
  // Required for a quiz (the specific quizAttempts doc just submitted —
  // QuizDoc.maxAttempts means there can be more than one); ignored for a
  // practiceTest, whose "attempt" is its own single progress doc.
  attemptId: z.string().min(1).optional(),
});

async function issueOrGetCertificate(uid: string, body: unknown) {
  const parsed = issueCertificateSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { sourceType, sourceId } = parsed.data;

  let attemptId: string;
  let sourceTitle: string;
  let certificationName: string;
  let attemptNumber: number;
  let questionsCompleted: number;
  let totalQuestions: number;
  let scoreCorrect: number | null;
  let completionPercent: number;
  let passMarkPercent: number | null;
  let completedAtMillis: number;
  let durationSeconds: number | null;

  if (sourceType === 'quiz') {
    if (!parsed.data.attemptId) throw Err.invalidArgument('attemptId is required for a quiz certificate');
    attemptId = parsed.data.attemptId;
    const attemptSnap = await db.collection('quizAttempts').doc(attemptId).get();
    if (!attemptSnap.exists) throw Err.notFound('Attempt not found');
    const attempt = attemptSnap.data()!;
    if (attempt.userId !== uid) throw Err.permissionDenied();
    if (attempt.quizId !== sourceId) throw Err.invalidArgument('attemptId does not belong to this quiz');

    const quizSnap = await db.collection('quizzes').doc(sourceId).get();
    if (!quizSnap.exists) throw Err.notFound('Quiz not found');
    const quiz = quizSnap.data()!;

    const eligible = isQuizAttemptCertificateEligible(
      attempt.status,
      attempt.correctCount ?? 0,
      attempt.totalQuestions ?? quiz.totalQuestions ?? 0,
      quiz.passMarkPercent ?? 60
    );
    if (!eligible) throw Err.failedPrecondition('This attempt is not eligible for a certificate yet');

    // Attempt number — how many of this learner's own completed attempts on
    // this quiz (by submission time) this one is, oldest first.
    const allAttemptsSnap = await db.collection('quizAttempts').where('userId', '==', uid).where('quizId', '==', sourceId).get();
    const completed = allAttemptsSnap.docs
      .filter((d) => d.data().status === 'submitted' || d.data().status === 'auto_submitted')
      .sort((a, b) => (a.data().submittedAt?.toMillis?.() ?? 0) - (b.data().submittedAt?.toMillis?.() ?? 0));
    const idx = completed.findIndex((d) => d.id === attemptId);
    attemptNumber = idx >= 0 ? idx + 1 : completed.length;

    sourceTitle = quiz.title ?? attempt.quizTitle ?? 'Mock Exam';
    certificationName = quiz.category ?? 'Other';
    questionsCompleted = attempt.answeredCount ?? 0;
    totalQuestions = attempt.totalQuestions ?? quiz.totalQuestions ?? 0;
    scoreCorrect = attempt.correctCount ?? 0;
    completionPercent = totalQuestions > 0 ? Math.round(((attempt.correctCount ?? 0) / totalQuestions) * 100) : 0;
    passMarkPercent = quiz.passMarkPercent ?? 60;
    completedAtMillis = attempt.submittedAt?.toMillis?.() ?? Date.now();
    durationSeconds = attempt.durationSeconds ?? null;
  } else {
    attemptId = `${uid}_${sourceId}`;
    const progressSnap = await db.collection('practiceProgress').doc(attemptId).get();
    if (!progressSnap.exists) throw Err.notFound('No practice progress found for this test');
    const progress = progressSnap.data()!;
    if (progress.userId !== uid) throw Err.permissionDenied();

    const testSnap = await db.collection('practiceTests').doc(sourceId).get();
    if (!testSnap.exists) throw Err.notFound('Practice test not found');
    const test = testSnap.data()!;

    const answeredCount: number = (progress.answeredQuestionIds ?? []).length;
    const eligible = isPracticeTestCertificateEligible(answeredCount, test.totalQuestions ?? 0);
    if (!eligible) throw Err.failedPrecondition('This practice test is not fully completed yet');

    sourceTitle = test.title ?? 'Practice Test';
    certificationName = test.examName || test.category || 'Other';
    attemptNumber = 1; // one completion certificate per (learner, practice test) — see CertificateDoc's own comment
    questionsCompleted = answeredCount;
    totalQuestions = test.totalQuestions ?? 0;
    scoreCorrect = null; // practice tests have no pass/fail score
    completionPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
    passMarkPercent = null;
    completedAtMillis = progress.updatedAt?.toMillis?.() ?? Date.now();
    durationSeconds = null;
  }

  const sourceAttemptKey = buildSourceAttemptKey(uid, sourceType, sourceId, attemptId);

  // Idempotent: a repeat request for the same already-completed attempt
  // returns the existing certificate rather than minting a duplicate.
  const existingSnap = await db.collection('certificates').where('sourceAttemptKey', '==', sourceAttemptKey).limit(1).get();
  if (!existingSnap.empty) {
    return { certificate: { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() } };
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const learnerName: string = userSnap.data()?.name ?? 'HelpCertify Learner';

  const now = Timestamp.now();
  const ref = db.collection('certificates').doc();
  const doc = {
    learnerUid: uid,
    learnerName,
    sourceType,
    sourceId,
    sourceTitle,
    certificationName,
    attemptId,
    attemptNumber,
    questionsCompleted,
    totalQuestions,
    scoreCorrect,
    completionPercent,
    passMarkPercent,
    completedAt: Timestamp.fromMillis(completedAtMillis),
    durationSeconds,
    status: 'issued' as const,
    revokedAt: null,
    revokedReason: null,
    sourceAttemptKey,
    createdAt: now,
  };
  await ref.set(doc);
  return { certificate: { id: ref.id, ...doc } };
}

async function getMyCertificates(uid: string) {
  const snap = await db.collection('certificates').where('learnerUid', '==', uid).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => ((b as { completedAt?: Timestamp }).completedAt?.toMillis?.() ?? 0) - ((a as { completedAt?: Timestamp }).completedAt?.toMillis?.() ?? 0));
  return { certificates: rows };
}

const certificateIdSchema = z.object({ certificateId: z.string().min(1) });

async function getCertificate(uid: string, body: unknown) {
  const parsed = certificateIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const snap = await db.collection('certificates').doc(parsed.data.certificateId).get();
  if (!snap.exists) throw Err.notFound('Certificate not found');
  const cert = snap.data()!;
  if (cert.learnerUid !== uid) throw Err.permissionDenied();
  await logCertificateAccess(parsed.data.certificateId, uid, 'view');
  return { certificate: { id: snap.id, ...cert } };
}

// Public — no auth required, matching how a real credential-verification
// page works (a third party checking a certificate a learner shared with
// them). Returns only the fields relevant to verifying authenticity, never
// account-internal data.
async function verifyCertificate(body: unknown) {
  const parsed = certificateIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const snap = await db.collection('certificates').doc(parsed.data.certificateId).get();
  if (!snap.exists) throw Err.notFound('Certificate not found');
  const cert = snap.data()!;
  await logCertificateAccess(parsed.data.certificateId, null, 'verify');
  return {
    certificate: {
      id: snap.id,
      learnerName: cert.learnerName,
      sourceType: cert.sourceType,
      sourceTitle: cert.sourceTitle,
      certificationName: cert.certificationName,
      attemptNumber: cert.attemptNumber,
      completionPercent: cert.completionPercent,
      status: cert.status,
      completedAt: cert.completedAt,
      revokedAt: cert.revokedAt,
    },
  };
}

// Renders the certificate PDF fresh, every time, from the stored
// server-trusted doc — never from a client-supplied blob. A4 landscape,
// print-ready, with an embedded QR code linking to the public verify page.
async function buildCertificatePdf(cert: Record<string, any>, certificateId: string, verifyBaseUrl: string): Promise<Buffer> {
  const verifyUrl = `${verifyBaseUrl}/verify/${certificateId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brandBlue = '#155EEF';
  const ink = '#0F172A';
  const faint = '#64748B';

  doc.setDrawColor(brandBlue);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  doc.setLineWidth(0.4);
  doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

  doc.setTextColor(brandBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HELPCERTIFY', pageWidth / 2, 26, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.text(`A product of ${HELPCERTIFY_OPERATOR}`, pageWidth / 2, 32, { align: 'center' });

  const title = cert.sourceType === 'quiz' ? 'Certificate of Mock Exam Completion' : 'Certificate of Practice Exam Completion';
  doc.setTextColor(ink);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 48, { align: 'center' });

  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('This certifies that', pageWidth / 2, 62, { align: 'center' });

  doc.setTextColor(ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(String(cert.learnerName), pageWidth / 2, 74, { align: 'center' });

  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('has completed', pageWidth / 2, 84, { align: 'center' });

  doc.setTextColor(ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(cert.sourceTitle), pageWidth / 2, 94, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(faint);
  doc.text(`${cert.certificationName} preparation · Attempt ${cert.attemptNumber}`, pageWidth / 2, 100, { align: 'center' });

  const completedDate = cert.completedAt?.toDate ? cert.completedAt.toDate() : new Date(cert.completedAt);
  const factsLine =
    cert.scoreCorrect !== null && cert.scoreCorrect !== undefined
      ? `${cert.questionsCompleted}/${cert.totalQuestions} questions · ${cert.completionPercent}% score · Completed ${completedDate.toLocaleDateString()}`
      : `${cert.questionsCompleted}/${cert.totalQuestions} questions · ${cert.completionPercent}% complete · Completed ${completedDate.toLocaleDateString()}`;
  doc.setFontSize(10);
  doc.text(factsLine, pageWidth / 2, 110, { align: 'center' });

  // Footer block, laid out bottom-up from the inner border (at
  // pageHeight - 13) so the QR/disclaimer/certificate-id never collide or
  // clip against it, regardless of how many lines the wrapped disclaimer
  // takes.
  const qrSize = 26;
  const qrY = pageHeight - 58;
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 20 - qrSize, qrY, qrSize, qrSize);
  doc.setFontSize(7);
  doc.setTextColor(faint);
  doc.text('Scan to verify', pageWidth - 20 - qrSize / 2, qrY + qrSize + 5, { align: 'center' });

  doc.setFontSize(7);
  const disclaimer =
    'This certificate confirms completion of independent exam-preparation content on HelpCertify. It is not issued by, affiliated with, ' +
    'or a guarantee of certification from ISACA or any other professional certifying body.';
  doc.text(disclaimer, pageWidth / 2, pageHeight - 28, { align: 'center', maxWidth: pageWidth - 90 });

  doc.setFontSize(9);
  doc.setTextColor(faint);
  doc.text(`Certificate ID: ${certificateId}`, 20, pageHeight - 17);

  return Buffer.from(doc.output('arraybuffer'));
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Certificate';
}

const downloadCertificateSchema = z.object({ certificateId: z.string().min(1) });

async function downloadCertificatePdf(uid: string, body: unknown, req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = downloadCertificateSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const snap = await db.collection('certificates').doc(parsed.data.certificateId).get();
  if (!snap.exists) throw Err.notFound('Certificate not found');
  const cert = snap.data()!;
  if (cert.learnerUid !== uid) throw Err.permissionDenied();
  if (cert.status === 'revoked') throw Err.failedPrecondition('This certificate has been revoked and can no longer be downloaded');

  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'helpcertify.com';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const pdfBuffer = await buildCertificatePdf(cert, parsed.data.certificateId, `${proto}://${host}`);
  await logCertificateAccess(parsed.data.certificateId, uid, 'download');

  const typeLabel = cert.sourceType === 'quiz' ? 'Mock' : 'Practice';
  const nameLabel = sanitizeFilenamePart(cert.certificationName ?? cert.sourceTitle ?? 'Certificate');
  const filename = `HelpCertify-${nameLabel}-${typeLabel}-Completion-${parsed.data.certificateId}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(pdfBuffer);
}

const revokeCertificateSchema = z.object({ certificateId: z.string().min(1), reason: z.string().trim().max(500).optional() });

async function revokeCertificate(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = revokeCertificateSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certificates').doc(parsed.data.certificateId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certificate not found');
  await ref.update({ status: 'revoked', revokedAt: Timestamp.now(), revokedReason: parsed.data.reason ?? null });
  return { success: true };
}

async function restoreCertificate(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = certificateIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('certificates').doc(parsed.data.certificateId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Certificate not found');
  await ref.update({ status: 'issued', revokedAt: null, revokedReason: null });
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };

    // Public — no signed-in learner required, matching how a real
    // credential-verification page works for a third party checking a
    // certificate someone shared with them.
    if (action === 'verifyCertificate') {
      res.status(200).json(await verifyCertificate(data));
      return;
    }

    const { uid, role } = await requireUser(req);

    switch (action) {
      case 'listResultsForQuiz':
        res.status(200).json(await listResultsForQuiz(role, data));
        return;
      case 'listResultsForStudent':
        res.status(200).json(await listResultsForStudent(uid));
        return;
      case 'getMyResultForQuiz':
        res.status(200).json(await getMyResultForQuiz(uid, data));
        return;
      case 'deleteAttempt':
        res.status(200).json(await deleteAttempt(role, data));
        return;
      case 'issueOrGetCertificate':
        res.status(200).json(await issueOrGetCertificate(uid, data));
        return;
      case 'getMyCertificates':
        res.status(200).json(await getMyCertificates(uid));
        return;
      case 'getCertificate':
        res.status(200).json(await getCertificate(uid, data));
        return;
      case 'downloadCertificatePdf':
        await downloadCertificatePdf(uid, data, req, res);
        return;
      case 'revokeCertificate':
        res.status(200).json(await revokeCertificate(role, data));
        return;
      case 'restoreCertificate':
        res.status(200).json(await restoreCertificate(role, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('results handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
