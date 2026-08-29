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
// White-matte JPEG of the HelpCertify lockup for the certificate PDF
// header. Regenerate with scripts/gen-logo.mjs (writes the base64 to
// scripts/_logo-print-base64.txt). ~330x120 px.
const CERT_LOGO_JPEG = '/9j/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAB4AQcDAREAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAAAAcGCAMEBQEC/8QAUBAAAQMDAQUDBwkDBwgLAAAAAQIDBAAFEQYHEiExQRNRYQgUInGBkbEyNkJSc3ShsrMjN8EVJCY0Q2JyFjM1Y5TC0eElRFNkdYKSotLi8P/EABsBAAIDAQEBAAAAAAAAAAAAAAAGBAUHAwIB/8QAPxEAAQMCAwQGCAUDAwUBAAAAAQACAwQRBSExBhJBURNhcZGxwSIyMzSBodHwFDVScuEWI2IkQoIVU5KiwvH/2gAMAwEAAhEDEQA/ALU0IRQhFCEUIRQhFCEUIXJ1HFu8iKhdnlJafaJJaXwDw7t7B3T3HBHfXSJzQfTCh1sUz2joH2I+ahg1xfIL7rEgJLjGO0afa3Vo9eOncRkHoamfh43C4S4/Faynduy8OY+i6ETaTvECRDRjqULx+Brm6l5FSodoL+u1duJrW0ycBbi2D/rE8PeK4ugeFYxYvTv1Nu1dpiSzKbDjDqHUH6SDkVyIIyKsWSNeN5puFkr4vaKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKELl33T8C+MfzoFp1sHs5LZCXGu/B7u8HIPUV0jkcw5KNU0sc7d1/ekYxeoM64zILMhKnozxbS8lBQ08nPokEnCVH6pPqPSrVrrhZ/U0+449GdO7+Fu+dONEg73Dhg8DX3dBUXpnN1WKBqu82W6dstaW4WeDrGSpA6byOviePqqNVbzI7sZvHle3dfLw7VPw6rf03tNz4XHxtn8imnp7X0O5tMiYUMlzgh9J/ZLPifonwNVMNRFO4sjJ3hq0izh8OI6xcdac46xzLCpFr6OBu0/HgeoqWAhQBByDXVWN0UIRQhFCEUIRQhFCEUIRQhFCEUIRQhFCEUIRQhFCEUIRQhFCEUIRQhal1u8CyQlzblLZix0fKccVgerxPgK7U9PLUPEcTSSeS5yzMibvyGwS8uu2VRaL1mtI81Jwibc3hHaX/hTxUoUy0+zWe7USel+lo3iO06BUc2OgexbcczkFxDtouu9wuOlc9U7knA9uKn/wBMQ/ok/wDVRP8Ars3+PzX2nbXdeRe0ov1Pvo+Ka8nZeHlJ3NPmvox6XiG95WdO26cOCo2nnP8ADclJ+KK8HZaPgXj/AIj6r2Mff+lvf/Cynbo62Mrs1udH+puyCfcUivH9KA6SOHaw/Vev6gI1YP8Ay/hYF+UZDZVuu6dkpxzKZSFD4V0Gxcjhdsw7ij+pGDWM965OqPKFt9ytDsGNEk28yB2bkh5QKW0n/DxHr6Co9RspPStMpcHAclxqsadURGOBpBP3koxqm0w7bo6JAgvMvvTwJMh1pzeCgeQBHAiqYtu4lVIl/DwhhN3HVcKwa9fhrRbb3lcdPoplgZW13A/WT+Ir0H21UWSEPbcKTtXSDMUPNJbToPJWcZroHtKhup5GnRZWlLiOl+I6gr3fTQCFpWnuI/hVfW0ENSBvjMaEZOaebTw7NDxCs6HEZqe7TodQc2kdY89QptpfaAu2tJKkuOW8LDTkdZ9OIo5xuk80kAkZ7iKg0xlLzS1PtALh2geOduBHEfFX7a4UzGzxZwk2I1LDyvxB4d2qaNvuEW6RUSojyXWVjgpPwPca6uaWmxTBDMyZgfGbgrm601AvS2lrleW2kvORWSpCFciokAZ8MkVNwyjFXVR05Ng4rnWT9BC6QcFXVG3HXSJPam6srTvZ7JUVvcPhwGce3NaYdlMNLd3cPbc3+nySeMbq96+98grI6ZvB1Bp63XYtdkZkdDxQDkJKhkisvrqb8NUPgvfdJHcnOml6WJsnMXXTqIuyQO0vbHqa26tnWqzSW4MWEvsc9ilanFAAkkqB6ngBWjYHs1Ry0jJqgbznZ6kW7kp4li88c5jiNgFMdiu0O661jXGLeC27IhFtSX0ICO0Sve4EDhkFPMd9Um0+DQ0DmPgyDr5a2tb6qxwbEJKlrmy6i2fambSortFCEUIRQhLXbvqa6ad0xFFqlORHJcnslvNHCwgJJwD0yQOI4007J0MNVVO6Zu8Gi9jpe6pcbqZIYR0ZtcpMaL13qSFqq2KF5nvNuSm2nGn31OIcQpQBBBJ6Hn0p5xTCaSSlkHRgEAkEAAggdSW6KunbO30ybkalWxrHU/IoQihCKEIoQihC52oL7D01aJF0nL3WWE5wOaz0SPEmpNHSSVUzYYxmVxqJ2QRmR+gVc9T6ykX1X+UF7UHVrUoWu2g5aaSDgurHUZ4AfSIPQVp9Dhraf/S0+QHru4nqHnyHWUkVdW6o/vSn9o8z95qCz7nLuchUmW+t51X0lHl4DuHhTBDAyFu5GLBVrnFxu5awJ766rzZe7xzXxFkZNCEE0IsvDyoQFqSUApOeRGONR5QCDdSIzY5LmaV1HeYl1TaLdHkXOB2hBip5IyeaD9E+HI1muJGISkMVzWU0DoRNOd13Pn8OKmcy2MzHHHELQ2ltRQ52hCC2oc0qzyPhVU4gi6pId4P3VpptziVeju7hON5CgQfca8KabqeaM0xHud/tNvfaLjbjn7YEklSQMkfhXl5LWkrvTASzsitxzTcuWzDT7MxtqA3JhKuH7F1Tb6lEJQCsboXkcCPcTVHVTvFTARrd3dum/km1mEUzoJWAWBA05g5LcsGhrlpe4NLt95D0JSsSGZDXpKT4FJxnxwKtHzh4s4ZqupcKfSSh0Mno8QQvdsP7tb59in9RNWmzf5lD2+RUrFvdH/fEKp/0vbWxcEgq3uzT5gaf+4tflrFsc/MJv3FaFh3u0fYFJTyqqU1VF2ofvCv/AN7V8BW0YD+Xw/tWfYp70/tTD8mj+t6g+zj/ABcpZ249SH/l5K32c9aT4eae9Z6mpR6+bQdLacfMe6XuIw+ObQUVrT60pBI9tWVLg9bVN3oYyRz0HeVEmr6eE2keAVrWzanoy7PJYi6gh9qo4CXctZPhvgV2nwDEIW7z4jbqz8LrnHidLIbNePDxUqBBGQcg1TqelB5SXzbtP30/pqp12J95k/b5hL20XsW9vkkdpjjqW0/fWP1E0/1/u0n7XeBSvS+2Z2jxVzH5DMRhb8h1tllsFS3HFBKUjvJPIVhrGOe4NaLkrR3ODRdxsFy7brDTt4lCJb73bpUg5IaakJUo454GeNS58NqoG78sbgOZBXCOrgkduseCe1fF/wBbad0woIvF3ixHFDIbUrKyO/dGTj2V6pMLq6vOCMuHPh36InrIYMpHALBZNomlNRSBGtt8iPPq+S0SULV6goAn2V0qsGraZu/NEQOeo+S8Q19PMd1jwT981IqrFMRQhJDbtqQu3NqzpUSzAZ86dT0U6rggH1ZB9pp+2TorRGc6vNh2DVKmP1N3iEaDM9vBJJ99b7m8tRVgBIz0A5U+saGiwS0TfVYq9IXtC+I618QjHGvqEV8QvDyoJAX0LDCtsnVEswoe+iKg4fkIGTn6ie8n8KWMVxIAFrTl4/fFTN6Ojj6ef4BNW3WWBs/tgiQGW0XVxPFSP+rAjme9wj3evkkSSGV1zoqGqqpHvMspvIdP8R9fDt0h9ztCnXlSG3FNun5RSSAv14rg+LiF9pa0xjc4LHaIUhy4xmkvrb7R1KO1wFboJxyPSuW6VObV+kLqzmmdE2O3PRb3b4647zjIUUJdUps7yePBWe+oT5HWLStApKKG7allwSOeWYWR+7l/W0e2JZSrzdtayre5BSRk/jj30sS1jn4synDbhoPzGvl8Uzspw2idKTqR8ipNTEqtQ3bF+7W+/Yo/UTV5s3+ZQ9p8Cq7FvdH/AHxCqf1zWxJBTa05t+f09YYFpTYGnxDYSyHDKKd/dGM43eFJtbsg2pnfOZbbxJtbn8Vf0+PGGNse5ewtr/C6J8paTj5tM/7Yf/hUX+h2f94/+P8AK7f1G7/t/P8AhKfU17OpL/Pu62QwqY8XS0FbwRnpnAzypxoaX8LTsgBvui11QVM/TSukta6bHk0/1zUH2cf4uUnbcepD2u8lf7OetJ8PNdfbhtMk2Ip03Zn1My3WwuVIQcKaQeSEnoo889BjvqHsrgbKj/V1Au0HIczzPUPFScaxJ0X9iI2J1KS+mtJX3WUtxizwlylo9J1wqCUIz1Uo8Mnj4mnmuxGmoWB07rcufwCWqaklqXWjF1tap2e6k0c029d7eW47h3UvNrDje93EjkfXXKgxmkriWwPuRw0K6VWHz0wvIMlPthe0aXFurWlrlIU7DkgiGpw5LLg47gP1SM4HQ4xzpd2rwVj4jWwizh63WOfaPBW2CYg4PFPIcjp1KQ+Ukf6OWn76f01VWbE+8yft8wpe0XsW9vkkfpj5y2n76x+omn+v92k/afApXpfbM7R4qwnlAurb2flKFqSHJjKVgH5Q9I4PhkD3Vmux7QcQueDT5Jvx0kUuXMKuFvnybXOYnRHS1IjuBxtwc0qHI1qE0LJmGOQXBFikyOR0bg9pzC7MHSWrNVodusS1XG4pcUVLk7pPaK6+kT6R9Wagy4jRUZEL3tbbhy+A0UplJU1F5A0nrXEkMSIMlbElp2PIZVhbbiSlaFDvB4g1PY9kjQ5huD3FRHNcw2IsQrCbDNoknUUV6w3Z8vToaA4w8s5U81nBCj1UkkceoPhWa7V4MylcKmAWa7IjkfoU34JiDpmmGQ3I+YTYpOV+qr7U5i5Gr9RbxyfPEN/+VIUP4CtdwCMNpILfpJ70g4o+9TJ2qD0wKsQSAOJAA6mvLnBouV9AJ0Woq6wEOdmZsdKu4rFQziEF93eUgUkxF909y2gQpIUlSVJPEKScg1KZI14u0rg5pabFe5wK6LyivhKFjhQZWpJhgwSpLCCBJkJGdwH6I71Gl3FMTaxpDTl49Q81LHR00fT1GnAc04bTaYOhba02w0BMKMsNnB83B+mrvWeY9/dSLPO6Z1zp95KjqKqR7+nm9c+qP0jn28u88Fy3ip1SnFkqUo5USckmvAVctGQ2M8KELpaR0nK1FeWWo6ShCVbynMcEgdfZXGVwYLlW2F0UtZKGM71YpxbFotpWo7rEVrr9VI/5VSVEzYmOlfoASVrtPB6sTOoBLjSVxcuGt0SXf848lwqBOd0lKjgerdArPNnal1Rijpn6u3k2YnCI6Lo26CyaFaOlNQ3bF+7W+fYp/UTV5s3+ZQ9vkVXYt7o/74hVP45rYkgqd2fYtqy+WuLc4bcEx5TSXW9+Ruq3TyyMcKXqnaihp5XQyE3abHJWsWDVErA9trHrW6dgGtAM9nbv9q/+tcP6vw/m7u/ldf8AoNT1d6gd5tMmw3WVa5gQJMVwtuBCt4ZHcetMNLUMqImzR6OFwqmaF0LzG7UJv+TQcy9QfZx/iukvbj1Ie13kmHZzWT4eaW20Se5cddX2Q4ST5642M9EpO6B7kimjBohFQwsH6R881TYhIX1MhPM/JdnQ+1q46EtC7dAtVveDjynluu7++okAccHkAOFQcV2dixCYTSvIsLWFrKTRYs+lj3GNC3dT7b7tquxS7PMtFtQzJSElaN/eQQQQRk8wRXCg2Wgo521Ecjrt7F0qcaknjMTmix7VCNOvuRtQ2x9nIcblsqTjnnfFX9a0Pp5Gu0LT4KspiRK0jmE8vKS+bdp++n9NVZ/sT7zJ+3zCaNovYt7fJI7THzktP31j9RNP9f7tJ+0+BSvS+2Z2jxVg/KE+YKfvzPwVWbbHfmH/ABPkm7HvdviPNV2skFN0vMCAolKZMlpkkdApQB+NaZVS9DC+Uf7QT3BKEDA+RrDxICuhDiR4EVqLFaQywygNttpGAlIGABWFySOkcXvNycytIYwNaGtGQSQ8pKyxmnbReW20pfe34zqgOKwAFJJ78ekKftiap5ElOTkLEeBSztFC0bko10UD2Qz3IG0WyrQcB11TCh3haSPjg+ymHaOISYdKDwF+4qpwh5ZVstxy71bGsdT8qn7Tfnhf+n8/P+9WxYF7nD+36LPsS95k7VDyrAq6JsLlV4C6OkNGnW8tcie6tizMqxlJxvkcyrrjw60j43ibt7cafgvVRV/hCIorb51JzDR9UzWXbNZmVQ7FYbZHjngpTsRDi3PE7wOPZSs8ukO885qsGKzRkmM363Zk99wOwKK6k0fGnNOXHTcFqNcEAqkW5hO61KSOZaT9Fwc8Dgr11cYViz6R2683b4KdTYj+I9Cc58/vh4cFCW3EPNhxs5Qe/gQeoI6Ed1aHT1DJm7zSuz2FhsV8xokq+zTb4O8gJwZEgJyGU/xUegqpxPEWxtLQcvvIfeS7sbHCzp5tB804NP2O36Js7CwyhUhQ3o7CuJGf7VzvJ6Dr6hxQampfO/P76gqSpqXSuFTNqfVbyHM+Q466a6T7zkl5bzyitxZypR5k1xCriSTcnNYyOBr6F5K1pKosKG9cLg+I8JgZWs8So9EJHVR6CvTWuc4MYLkqbRUjql+6NFNvJ/1ku+SbnBXCRFbKQ9HSBlSEpISUqV9L5ST6ya741hYpoI5eOh8fqFoeAiOJzoWD4qe7RVXNVk83t7KlIdV+2cHHswOXDHLPH2Vme1Dp/wAKI4mEtJ9K3IZ/PmnzB2xdNvSGxGih+zSNIl6lEpLa22I7Kt7fGCSRhPtOSaoNk6c/iy/9IPzVxjkobT7nMpt1oqUFDdsX7tb59in9RNXmzf5lD2+RVdi3uj/viFU/6XtrYkgq3uzT5gaf+4tflrFsc/MJv3FaFh3u0fYFJTyqqU1VF2o/vBv/AN8V8BW0YD+Xw/tWfYn70/tTC8mj+t6g+zj/ABXS1tx6kPa7yVvs560nw81ANqdpcs2vryw4ghLshUls9Chz0hj3keymPAKgT0EThwFj2jJVOKQmOpeDxN+/NSvY9Z9B6miPW3UERo3dDpU0pyQtvt2yBgJwoAkHPDng1T7SVOJ0jxLSu/t2zsAbHry0KsMIho5mlkw9LtOYTCvWzPZdp6EubdILEVhAySuW7lXgBvZJ8BS1S45jNS8RwuJJ/wAR9FbzYbQQt3pBYdp+q5uzpnZTfL2FWC1LYuUX9q0iYV5OPpoBUQce8c6lY07G6eC1U+7HZG1u42APkuOHtw+WS8LbOHP/APV8eUl83LT99P6aq9bE+8yft8wvO0XsW9vkkfpf5y2n76x+omn+v92k/afApXpfbM7R4qwXlCfMFP35n4KrNtjvzD/ifJN2Pe7fEearjb5jlunRprOO0juoeRnvSQR8K0+aMSxujdoQR3pNjeWODxwVvtOa0smp7S1cYU5jcUkFxtbgC2VdUqB5EVitbhlRSSmGRpvwyyPWFodPWRTMD2n+Ej9vGt4OpLpDtdsfRJj2/fU482coW6rAwk9QAOfeT3U/7JYXLSxOmmFi+1hxsPqlfHK1kzxHGbhviuJsUtLl12h25SUktwwuU4ccglJA/wDcoVP2oqBDhzwdXWA7/oFGwWIvqmngM1aishT2qobTcHVt/PX+UCPzVsOBe6Q/t+iz7EveJO1QqRkMOFP1TVvLmwqFH6wumFoJxKdIFpgZw4C6RyHA4/HNZdiBJqX35lVGI73Svy4j+F0iONRFXr1DikLCkEpUDkEHBFfEAkG4XB1VoteoHl3KxuNQ7k6oeeNkeg+OrqQPpjqPpc+dWeH4k+muwnI/JX9DiLCAyozA++7w7FJNM6Zh6OtLTr6S4o+mw04PSfV1dc8PD2csmotXVvndmdPl/KiVdUahwnkFm/7W8+s9XjppdYpUl2Y+uQ+srcWclR61HAtoq173PcXONyVhxwr6vKFqZjxnpkx5MeHHTvvPK5JHcO9R5AdaACSGtFyVJpaZ9Q/calzfr67qiW1JdaLMBjPmETOcDq453qP/AC5c3HCcKEY3nZk6lNjGspY+jYmt5Oe9/lBKKjkmM6fWd5qo217Q2laBzHg5WWAm87j1HyVhKzpNy8CQnOABnur4AAi69r6hRjaba5d60HeYMBlT0lxjKG0817qgrA8cA4q2wOoZBXxSSGzQfKyhYjE6SmexgzsqoItFxckBhFvmKeKt0Nhhe8T3YxzrYTUxBu8Xi3O4SCIJCbBpurdaHt0m0aPs0CYjs5EeG024jPyVBIyPZWL4rOyaslljNwXEhaFRRujgYx2oAXcNQFJVVdrdhucLXt2eehSA1Ke7ZlxLZKXEkDiCPca1/Z2rhkoI2tcLtFiL6FImLU8jalxIyKYPk5WS4QmrxcJUR1iPI7FtlTiSntCneKiAegyONLW2lVFIYomOuRcm3C9lb7PQPYHvcLA281LdqmzFnXsJuRFcRHu0VJDLi/kuJ57ivDPEHofXVPgGOuw55a8XjdqOR5j7zU/E8NFU27cnDT6KuV80dqDTb5Zulolx8HgvsyptXiFjIPvrTqXE6WqbvQyA/HPuOaTpqKaE2e0haUS13K6PJahwZkt08AlppSz+ArvJUQwjekcGjrIC5sikkNmglOvY7sku1lvDOo74nzNbKFBiJvZWSpJBUvHADBPDn34xSJtJtFBPCaSm9K+p4ZZ5fVMuEYVJFIJ5craBdnyg7LPumlYb0GK7IESV2jqWklSkoKCN7A6A4z66gbH1UUNW5sjrbwsL87qTj0L5IAWC9iklofT90umrLUzGgyFlMtpxai2oJQlKgSonHAAA0/YrWQxUkjnuGhGvEhLNFTyPnYGjiE8vKE+YKfvzPwVWf7HfmH/E+SaMe92+I81XGBDXcJ0aG2UpXIdQykq5AqUAM++tPmlETHSHQAnuSZGwvcGDiupqDRV/0vJWxdLXIawSA6EFbax3pWOB+NRKPFKWraHQvB6tD3KRUUU0BtI36LFZdKXzUUlMa12uXJWo4ylshCfWo8APWa91WIU1K3fmeB8c+7VeYaSaY2jaSrK7LdnLWgbSvt1ofukvCpLqfkpA5IT4DJ49T7KyvHsadiMw3cmN0HmevwTphmHikjzzcdfopvVCrNVQ2mDGrr/43BX+9WxYEf8ARw/t+iz7EveJO1Q8gEEHkRirki4sq9bWidXK0rdlwZae0hu5HZn+1SeftHOs8x6iMcxfwKk1FL0zBPGLnRw6kz347a47c2EsvQnuKF9Un6qu41QA8DqlueDc9JubVrYr2oyEqUhW8hRSQcgjhihAK+5Up6W6XZDinFkAFRPdQBZenvc87zjcrBzoXlZG0NhDr0h5EeMykuPPuHCWkDmT/wAOtGd7DMrvT0753hjUstUaod1hNQxGQtixxF5jsrGFPq/7VzxPQdB7abMGwkt/uSalN8cUdHHuM9Za7bYTxpwjjDRYKC95cblOLydh/SCSf+7O/mapP2y93b2j/wCle7Pe2PYfJWCrN04IoQihCKEIxQhFCEUIRQhFCEUIRihC8CQkYAx6qLoXtCEUIRQhLTygm1r0AVJSSETGVKI6D0hk+0j3007HkDEM/wBJ8lS48L0vxCr7pZtTmp7QhKSpSpzAAAyT+0TWk4gQKWUn9LvApRpQTMy3MeKubjIrDVpCAAKEIoQihCqhtOONYX1J5meo+zjWxYF7nCf8Vn2J+8ydqh9XSr1oXOAJjfAlLieLaxzQe8VX19G2ojLXKXS1BidcaLs6C15KsspVtuAC2lcHWT8l1P10+NZ3XUL4XFrl0rqJrmdPALtOoTOkMMrYRMguiRDd4pcHNJ+qruNQAeB1StPBuek3MfeRWqeAr2oy8HEUL5dfbLQcK1LdQy02krdecOENIHNSj0FB6l2ggfM8MYltq/VqtVOi3W7tGbJHXvAEYVMWP7RY7vqp6c+dNGEYSR/ck1TdBAyjj3R6y58dkNpAFOUUYaLBRZH7xWwK7LinB5O/+npAHPzd0n/1NUlbZewb2j/6TDs97Y9h8lYCs4TgihC17jcYlphuTJ0huPHaGVuLOAP/AN3V6a0uNguU0zIWGSQ2ASwvG3eO06pu0WpT6ByekL3AfUkZOPWRU9lAT6xSnU7Wsa60DL9Zy+S0Ye3uYl0ee2VhbfXsXilQ94INejQDgVHi2uff+5GLdRTL0vq+1auhmRbXiVIwHWXBhxo+I/iOFQZYXRmzk1UGIw1rN+I9o4hdquSnooQihCKEIoQvFrS2hS1qCUpBJUTgAd9C+EgC5UbtW0bTF6uabbCuQckLJCAW1pCyOgJGDXd9NI1u8Rkqunxqjnl6GN9z2FSWuCtUlJ23G7M3twswon8ntulPZKSe0UgHGd7PA+zFWjaFhbmc0hybVTic7rRuA6cbdvNOB9uHdbYpMtlp6HIaytt9IKSkjPpA8Kr43vieHRmzhxCdzuSR3cMiOKRU3Wen7BeVPaQ0taWC0Slua80VLV3qSM+iD78d1MD6irqI9yplcQeF/u6Q6nHYoZT+DiGXE+XJT3ZltGuGsJsqBcY0dDjLQeQ4wCkEbwBBBJ7xVRVUzYgHNV3gWNS1z3RytFwL3CYdQkzIoQihCrdtvsCoGsHpO6UtzUh5CuhOMH8R+NajstWCSjDOLckk45T7lQXc80siClRSoYI5imvVUi+SM0EIBXOuVsTLSFJJbdQd5DieaTVZXULKhlip1LVOiPVyXc0Hr9+xyV224JCmVjDzSjwcH1k1n1dROhdukW+/Bfa6hDm9PBm06hM19hlxhudDc7aG9xQvu8D3GoLXcDqlWeDczGn3kVhaaLqiAUpABUtazhKEjmpR6AV6JsuUUTpXBjRmltrLVx1Ks2i1KWiytrBW5yVNWPpH+4Og9ppkwnCiT0sgz8E4UtMyiZ/l9/fUubGYS2kACnSKINFgo0jy4rYCakLjdek9KF8sn55O+nXY0Ofe3klIexGZ8QDvLPv3R7DWdbZVjXvZTt4Zny8017PUxDXTHjkPNOSkhMyKEJDbZNVO3W/qs7Th8zt5AKRyW6RxJ9WcD21b0UQazfOpWd7TYg6Wo/DtPot8f40WbZ3sqRqWCm7Xd55mG4SGWmsBboHAqJPIZ5dTXypq9w7rdV7wbZ4VTOnnJDToBqVI7/sOtjkJa7JJkMy0jKUPub7a/AnGR6/wrhHXOv6eitKzZWEsJpyQ7r0K+9lezq7aXuMm53VaGVLaLCGG3N7IJBKlEcOnAeNfKqpbI0NavWAYNNSSOmmNsrW+qkOsdpFo0evzZ7flTiN4RmcZSDyKieCfj4VxhpnS5jIKzxLG4KI7js3ch58lDWtvau2/bWDDOfoScqHvTipRw/LJyoW7X+l6UWXb/CY+mdVWzVlv89tzpISd1xpYwtpXcofx5GoMsTozZyaaGvhrI+kiPaOIUV1Ttghaavj9q/kx+UqPuhxxLgSMkA4AI48CKkRUZe3euqiv2jjpZzDuE21zssGottVttbrTNuhLuDikJWslwNpb3gDu5wcqwePdXqOic7NxsudbtRDCQ2Ju8cuNrX7819av2oQo+mohRBfcXeYTikjeADII3eJ68T07q+Q0pLznoV9xHHo20zbNJ6Rp+HBJvTl1TYr5Aua2i8mK6lwtg4KsdM1ZyM32lvNI9FUCnnZMRexunxofaVE1rMkQ24L8R5lsOgLWFBSc4PEcjkiqiemMQve60PCsbjrnmMNIIF0vbtqPQaNWvyHdMyXezkntHA/htagrivsuR45OOvdU1kc3R2Dkt1Fbhoqy50JNjnnl22Uy2nbQI1jhu2VqO67Inw1EOpISlpKwUg9568KjUtOXnfPAq7x3GGU7DTgXLm68r5JI2iTDiXOM/cIipcVtYU4wFbvaAdM+vFWrwS0hpsUg0z42StdK3eaNRzTj0zrvS8Sw3e9W3Twt7kPs0vNMpTvOBRwj0h0zn1VWSwSFzWOde6eKHFqNkEtRDFultrgWzvpmurozapC1fdVW3zF2E+WytvecCwvHMcAMHHH2Guc9IY2717qXhmPx1svRbu6eGd7qUagvcbTtnlXSXvFqOjeKU81HOAB4kkCo8bC9waFb1lUylhdM/QKKaO2rxdW3kWsWx6I4ttS0LLgWk7vMHgMcKkTUhjbvXVPhm0DK2bodwg9t11NoGimNbWUxCpLUpo78d0j5J6g+B/4GpeEYm6gm39WnUffJWeIUQqo93iNFWTUenJ1jnuQblHXGlNnAKxwWOhz1HiK1Wiro6iMSRG4KRaimfC4seLFcJSVNq3VAg9xqxBB0Uey+TxoIQufcbYmWkKSSh1By24OaTVZXUDJ25jNTaaqdEepdPSW0ORpla4l1bK2F8HEZ9FwfWT3GkOtw2SJ9rL3U4a2b+5T6HULa1ZrUala/kmzh9i1EhUhxxO65KPMJP9wd3U8TVjhOElzt+XVc6WkZRNufWPyXJjx0tICUgAU7RRBgsFykkLjcrZSAKkWXAlejKiAkEk9BXwmyLKZ7Ptm1y1lcE9mhTMNtX7eWR6LfeE/WX4dOtUWL41FQx55uOg+vIKxoMPkqnWGTeJVorTa4tlt0e3Qmw3HjoCEJ8O8+J5msnqJ3zyOlkNyU9xRNiYI2aBbdcV0RQhVY1WpatT3guZ3/ADx7Oe/fNMEXqC3JZDiBJqpL/qPirIaQS0jStnDGOz8zZxj/AACqOa/SOvzWo4cAKWLd03R4Lr1zU1a1zmJt1ulTVDKY7K3SO/dST/CvTW7xAXKeXoo3SHgCe5VdRMbu18TLvUh0NSH+0kuoG8vBOTgfgKvrbrbMWSCQTT79QcibkqdX+57M5ljfi22G7GmJbPm7yY6grfHLeJPEHkc99RI21AddxyTDWT4PJAWRNs62Rsdetc7Y5dHYWtGYqVENTWltOJ6cElST7CPxNdKxoMd+SibNTujrQwaOBHyuubtNOdeXj7VP5E16pvZNUbHff5O3yCluhdkES+WRm63eXJb85G+0ywQndR0JJB4nnio89YWO3WhXOFbNx1EAmncc9AOSmerNAWGRpkJXHcBtMJwRlJcIIATnj38Rmo0NQ8P7Sr3EMIpnU1iPUabZ9SRuk7cxeNSWyBKCixJfS24EnBIPcatZXFrC4LP8OgbNUsifoSrC6Z0JZNJPPSLYw4l55IQpbjhWd3OcDPLjVNLO+QWctLocJp6NxdCMz1quF7/0xcPvLv5zV3H6oWX1Xtn9p8U9NoOk7VdtMPXiSyozYUAlpxKyOScgEdRn41U08zmv3BoStAxjD4JqUzvHpNbl3JNaJtMa+6qt1tmBZjvuFKwlW6SAknn7Ks53lkZcEkYXTsqKpkUmh+ifUPZ3YrbY7jaYUdSG7ggpdWtZWonGEnJ7iciqh1Q9zg48FoceDU0UD4IxYP149nckDa5cnSOqGJDiSl+3ycOp7904UPaM++rhwEjLc1nNPI+iqg46tOfmmZtw1E25bLZa4zoUmV/O1lPVAHoe8kn2VBoY/SLjwyTVtTWgxRwsPrel8OC+dhOn91qdfnUcVnzVgnuGCs+/dHsNFfJowL5snR2a+pdxyHmm3VcnNcbVGkbVq6AYdzjheAezdTwW0e9J/hyqdQ4hNRyb8J7RwPao1VSR1Dd2QKuuvNm1y0a+fOEKlW5SsMy0Dl4K+qfDr0rS8IxuKtb6OT+I+9UmV+GyUxuc281BXWFM8+KTyUORpha8OVWseAa9IusL8Vt5OFISr1io8sDX6hdY5XMORXyzGS1wAxRFCGaL6+Uu1WcJ4VIsuJKyNtKdOE8AOZPIV5c4BCbmzbYtIvCW7lfUuxIBwpDJ9F2QPH6ifxPhzpNxradsF4abN3PgPqfkr/DsFdLaSfJvLifoE+4ECLa4jUOFHbjx2k7qG204SkVncsr5XmSQ3J4pujjbG0NYLALPXNe0UIRQhV92vaces+qXp6UHzW4ntkLA4BePTT688fbVxRyhzLcQs22konQVRlA9F+fx4/Vd3ZptTg2i2N2W+LW02zkMSQkqSEnjuqA48Oh7vVXKppS52+xWOB4/HDEKepyA0PVyKlN92x6bt0NardINylEeg02hSU5/vKIGB6smo8dHI4+lkFb1e0tJEwmI7zuWfzK0NI6/e2hxbnYJ0RqPLdiOdmtkncUkjdwQeII3h1417mpxCQ8HK6jYdjDsTZJTSNs4tNracknITceFdmmrvHdUwy9uSWkHdXgHCgPEfwqzNy30UjxBkcwE4yBzHHrTROntk6YXnf8AKiS3u726Jiu09W58rPhiq/pKm9rJvNHggZ0m/l2592q3tmbGhp12fk2OJMZnxUEpEtZUdw8CpPEjw7xmvNUZg2zzkV3wNuGySl9M0h7efLmEutpo/p3ePtU/kTU2l9k1LGO+/wAvb5BPfQnzNsv3Nr8oqpn9o7tWhYT7lF+0eC3dRpK9P3NKQSTEeAA6ncNeI/XHau9aL08gH6T4KtWkLhHtWp7VOlK3GGJCFuKxndT1NXkzS5hAWW4bM2GqjkfoCFY6z6ssmoHnGLXcmJTrSQpaUE5AzjPEcRVI+J7BdwWn02IU9SS2F4JCrNeh/wBL3D7y7+c1ex+qFlVX7Z/afFWL1h8wLp/4ev8AJVLD7Udq07EvcJP2nwSQ2YfPyz/aq/IqrWq9k5IOBe/x9vkVZQcqo1qSRO2vT4tuomro0jDNwRleBwDqeB94wffVtQybzN08Fnm1FH0VQJm6P8QoM9Km3l+IytSn3UNtxWU9d0cEp/GpYAaCfil90klQ5rTmcgPIKzmmbK3p6wwrW3g+btBKiPpK5qPtJNUUr99xctYoaUU0DIRwHz4/NdOualooQsMyHHnxnIstlt9h1O6ttacpUPEV7jkdG4PYbELy9jXgtcLgpEbR9jciy9tdNPtrlW/ip2L8pbI6kfWT+I/GtBwXaVs1oak2dwPA/Q/JKeJYMY7yQ5jlySkei7oK2sqT1T1TTmyS+RS8RZawNdV8RQhbtss8y6y2osWO6+88cNtNpytZ8B3eNR56lkLC+Q2A1K6RxukcGsFyVYTZzsZiafDVxvqGpVwThTbA9JqOf95XjyHTvrN8Z2lfU3ipvRZz4n6BN2HYM2G0k2bvkE0KU1fIoQihCKEIoQtC+WKBqK3OW+5MB5hfHHIpPRST0I769se5h3mqPVUsVTGYpRcJSXnYVcWnlKtFwjyGSeCJOULHhkAg/hViyvb/ALgkup2TlDrwPBHXkfvuWnB2HaifdAly7fGb6qC1OK9gAHxr06uYNAuMWylU4+m4Ad6aWjtCWvRkdYihT0p0AOyXPlLHcBySPD35qBNO6U56Juw3CYaFvoZuOp+9AuRrfZTB1TIXcIb/AJhPX8tW7vNu+Kh0PiPca6QVboxunMKDiuz8VY7pWHdd8j981B0bCtQl3dVPtiUZ+WFLJx6t2pf49ltCqAbJ1V7FzbfH6JjaF2dQdFpcfS8uXOeRuLfUN0BPPdSnoM9+TwqFPUuly0CZ8JwWOgBcDdx4/RRrWOx+bqHUcq6RLlHabklKlIdQolBAAOMcxwzXaGsDGBpGiq8S2bfU1DpmPAB5pi2S2Istoh21DhcTFZQyFkYKsDGahPdvOLuaZ6WAQQthBvugBbqkhQIIBB4EHrXldyLpP6h2FyHZzj9jnx0R3FFQYkBQLeegUAcj1irKOuFrPCSqzZRxeXUzgAeB4LvbN9mcrR9wfuM+ay884z2KW2Qd1IJBJJOMngOlcampEo3WhWGCYG+hkMsjgSRbJcK5bDZcy9PyG7tHRDeeU4QptXaJSo5I7ieNdW1wDbWzVfNsq98xeJBuk360z7xZ0XWxy7T2im0SI6mAvGSnKcA+NQWP3XBybKmmE0DoL2uLJe6L2PzNO6ijXWbco7qI28pCGUKBUoggZzyHGpk1YHsLQEt4Zs4+mqGzveCByTSqAm1LfbLdrK/pVUVUlh6b26CwhtwKUhQPpEgchjI9oqbRMeH3tklfaWop3Uu4XAuuLefyUK2N6eN31QJ7qMx7cntcnkXDwQPifZUutk3Wbo4qg2ZoumqulIyZn8eH1T9qnWjooQihCKEIoQlprvYvA1C45cLI43bbiripJH7F095A+SfEe6mjCtpZaYCOcbzfmPqqSuwZk5L4snfJKS47I9YQ3Sh3Tzz5z/nIriVpV48D8RTlDtHQvFxLbtyS7JhFUw23L9i37BsR1TdHkecQG7Wzn0nZawpQHghJJJ9eKj1e1NHE30Hb55D6ldYMEqZD6Q3R1/RPLRmgLRomKUQmy9KcGHZboBcX4D6qfAfjSDieLz177yGzRoBp/J601UWHxUrbM15qS1VqcihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKEIoQihCKELBOYXKhSGG3C2t1tSErH0SQQDX1psQVzlYXsLQbXBSFY2L6rXKDK2IjLecF9T4Kcd+B6X4VbmtjtdZ23Zmtc/dIAHO/wBlObSGlYmkLOi3xSXFE77zxGC6s8z4DoB0FVk0pkdvFPOHYfHRQiJnxPMrt1yU9f/Z';

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

  // Brand lockup, centred in the header band (print JPEG is 263x120).
  const logoW = 44;
  const logoH = (logoW * 120) / 263;
  doc.addImage(CERT_LOGO_JPEG, 'JPEG', (pageWidth - logoW) / 2, 16, logoW, logoH);
  doc.setFontSize(9);
  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.text(`A product of ${HELPCERTIFY_OPERATOR}`, pageWidth / 2, 40, { align: 'center' });

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
