import { callAction, VercelApiError } from '@/lib/vercelApi';
import { auth } from '@/lib/firebase';

export interface AttemptRow {
  // Doc id - present at runtime on every row (toAttemptRow spreads
  // `{id: d.id, ...d.data()}`), just never previously declared here since
  // nothing read it before the certificate feature needed it to identify
  // *which* completed attempt to issue a certificate for.
  id: string;
  rank: number;
  userId: string;
  userName: string;
  quizId: string;
  quizTitle: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  notAnsweredCount: number;
  incorrectCount: number;
  correctCount: number;
  marks: number;
  durationSeconds: number;
  exitCount: number;
  // Present on every doc (QuizAttemptDoc.submittedAt) but not previously
  // declared here since nothing read it - the Home dashboard's "Recent
  // attempts" table needs a date per row. Serialized Firestore Timestamp
  // over JSON ({ _seconds, _nanoseconds }, not { seconds }) - read via
  // @/utils/formatDate's toDate().
  submittedAt: unknown;
}

export const resultsApi = {
  listResultsForQuiz: (quizId: string) => callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForQuiz', { quizId }),
  listResultsForStudent: () => callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForStudent'),
  getMyResultForQuiz: (quizId: string) => callAction<{ attempt: AttemptRow }>('results', 'getMyResultForQuiz', { quizId }),
  deleteAttempt: (attemptId: string) => callAction<{ success: true }>('results', 'deleteAttempt', { attemptId }),
};

// --- Learner completion certificates ---------------------------------------

export type CertificateSourceType = 'quiz' | 'practiceTest';
export type CertificateStatus = 'issued' | 'revoked' | 'superseded' | 'invalid';

export interface Certificate {
  id: string;
  learnerUid: string;
  learnerName: string;
  sourceType: CertificateSourceType;
  sourceId: string;
  sourceTitle: string;
  certificationName: string;
  attemptId: string;
  attemptNumber: number;
  questionsCompleted: number;
  totalQuestions: number;
  scoreCorrect: number | null;
  completionPercent: number;
  passMarkPercent: number | null;
  completedAt: unknown;
  durationSeconds: number | null;
  status: CertificateStatus;
  revokedAt: unknown;
  revokedReason: string | null;
}

export interface PublicCertificate {
  id: string;
  learnerName: string;
  sourceType: CertificateSourceType;
  sourceTitle: string;
  certificationName: string;
  attemptNumber: number;
  completionPercent: number;
  status: CertificateStatus;
  completedAt: unknown;
  revokedAt: unknown;
}

// Not a JSON action - the server responds with the actual PDF bytes (see
// api/results.ts's downloadCertificatePdf), so this bypasses callAction's
// res.json() and reads a blob instead. Shared by both the download and
// print flows below, since both need the exact same authenticated,
// ownership-checked PDF bytes - only what happens with them afterward
// differs.
async function fetchCertificatePdf(certificateId: string): Promise<{ blob: Blob; filename: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ action: 'downloadCertificatePdf', certificateId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new VercelApiError(body.error || `Request failed (${res.status})`, res.status);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(disposition);
  const filename = filenameMatch?.[1] ?? `HelpCertify-Certificate-${certificateId}.pdf`;
  const blob = await res.blob();
  return { blob, filename };
}

export const certificatesApi = {
  // Called right after a passing quiz submit / a practice test reaching
  // 100% answered - idempotent, always safe to call again (returns the same
  // certificate for the same already-completed attempt instead of minting
  // a duplicate).
  issueOrGetCertificate: (sourceType: CertificateSourceType, sourceId: string, attemptId?: string) =>
    callAction<{ certificate: Certificate }>('results', 'issueOrGetCertificate', { sourceType, sourceId, attemptId }),
  getMyCertificates: () => callAction<{ certificates: Certificate[] }>('results', 'getMyCertificates'),
  getCertificate: (certificateId: string) => callAction<{ certificate: Certificate }>('results', 'getCertificate', { certificateId }),
  verifyCertificate: (certificateId: string) => callAction<{ certificate: PublicCertificate }>('results', 'verifyCertificate', { certificateId }),
  revokeCertificate: (certificateId: string, reason?: string) =>
    callAction<{ success: true }>('results', 'revokeCertificate', { certificateId, reason }),
  restoreCertificate: (certificateId: string) => callAction<{ success: true }>('results', 'restoreCertificate', { certificateId }),

  // Drives the browser's native file-save via a blob + synthetic
  // <a download> click - an actual file download, not the page's print
  // dialog.
  downloadCertificatePdf: async (certificateId: string): Promise<void> => {
    const { blob, filename } = await fetchCertificatePdf(certificateId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  // Opens the same PDF in a new tab so the learner can use the browser's
  // own PDF-viewer print control - distinct from Download PDF, which never
  // opens anything, it just saves the file.
  printCertificatePdf: async (certificateId: string): Promise<void> => {
    const { blob } = await fetchCertificatePdf(certificateId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Deliberately not revoked immediately - the new tab needs the object
    // URL to stay alive to actually render the PDF it just opened.
  },
};
