import { Link } from 'react-router-dom';
import type { Certificate } from '@/features/admin/api/resultsApi';
import { toDate } from '@/utils/formatDate';
import logoLockup from '@/assets/logo-lockup.png';
import { ModalCloseButton } from './ModalCloseButton';

interface Props {
  certificate: Certificate;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  downloading?: boolean;
}

const STATUS_LABEL: Record<Certificate['status'], string> = {
  issued: 'Issued',
  revoked: 'Certificate Revoked',
  superseded: 'Superseded',
  invalid: 'Invalid',
};

// "View Certificate" - a read-only preview of exactly what the PDF says
// (learner name, item, attempt, score/completion, certificate id), reused
// by both the results-page "ready" panel and My Certificates. Download/
// Print/Verify all live here too so a learner never has to leave this view
// to act on it.
export function CertificateViewModal({ certificate, onClose, onDownload, onPrint, downloading }: Props) {
  const title = certificate.sourceType === 'quiz' ? 'Certificate of Mock Exam Completion' : 'Certificate of Practice Exam Completion';
  const isRevoked = certificate.status === 'revoked';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />
        <img src={logoLockup} alt="HelpCertify" className="mb-4 h-9 w-auto object-contain" width={197} height={90} />
        {certificate.status !== 'issued' && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-500">
            {STATUS_LABEL[certificate.status]}
          </div>
        )}
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-ink">{title}</div>
        <h2 className="mb-4 text-lg font-bold text-ink">{certificate.sourceTitle}</h2>

        <div className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-faint">Learner</span>
            <span className="font-medium text-ink">{certificate.learnerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-faint">Certification prep</span>
            <span className="font-medium text-ink">{certificate.certificationName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-faint">Attempt</span>
            <span className="font-medium text-ink">#{certificate.attemptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-faint">Questions</span>
            <span className="font-medium text-ink">
              {certificate.questionsCompleted}/{certificate.totalQuestions}
            </span>
          </div>
          {certificate.scoreCorrect !== null && (
            <div className="flex justify-between">
              <span className="text-ink-faint">Score</span>
              <span className="font-medium text-ink">{certificate.completionPercent}%</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-ink-faint">Completed</span>
            <span className="font-medium text-ink">{toDate(certificate.completedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-faint">Certificate ID</span>
            <span className="font-mono text-xs font-medium text-ink">{certificate.id}</span>
          </div>
        </div>

        <p className="mb-4 text-xs text-ink-faint">
          This certificate confirms completion of independent exam-preparation content on HelpCertify. It is not
          issued by, affiliated with, or a guarantee of certification from any third-party certifying body.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isRevoked || downloading}
            onClick={onDownload}
            className="rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            type="button"
            disabled={isRevoked}
            onClick={onPrint}
            className="rounded-lg border border-surface-border py-2 text-sm text-ink-muted disabled:opacity-50"
          >
            Print Certificate
          </button>
          <Link
            to={`/verify/${certificate.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-surface-border py-2 text-center text-sm text-ink-muted"
          >
            Verify Certificate
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-brand-500/30 bg-brand-50 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-500/10 dark:bg-brand-500/10 dark:hover:bg-brand-500/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
