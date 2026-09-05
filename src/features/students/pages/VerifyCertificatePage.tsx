import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { certificatesApi } from '@/features/admin/api/resultsApi';
import { toDate } from '@/utils/formatDate';
import { Logo } from '@/components/brand/Logo';

// Public certificate verification - reachable without signing in, the same
// way a real credential-verification page works for a third party checking
// a certificate a learner shared with them (an employer, for instance).
// Deliberately shows only non-sensitive fields (see api/results.ts's
// verifyCertificate) and the revocation status explicitly, per item 14.
export function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public', 'verifyCertificate', certificateId],
    queryFn: () => certificatesApi.verifyCertificate(certificateId!),
    enabled: !!certificateId,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        {isLoading && <p className="text-center text-ink-faint">Verifying…</p>}

        {!isLoading && error && (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
            <h1 className="mb-2 text-lg font-bold text-ink">Certificate Not Found</h1>
            <p className="text-sm text-ink-faint">
              This certificate ID doesn't match any certificate issued by HelpCertify. Double-check the link or QR
              code and try again.
            </p>
          </div>
        )}

        {!isLoading && data && (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
            {data.certificate.status === 'revoked' ? (
              <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500">
                Certificate Revoked
              </div>
            ) : (
              <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                ✓ Valid Certificate
              </div>
            )}

            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-ink">
              {data.certificate.sourceType === 'quiz' ? 'Certificate of Mock Exam Completion' : 'Certificate of Practice Exam Completion'}
            </div>
            <h1 className="mb-4 text-xl font-bold text-ink">{data.certificate.sourceTitle}</h1>

            <div className="space-y-1 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-ink-faint">Issued to</span>
                <span className="font-medium text-ink">{data.certificate.learnerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Certification prep</span>
                <span className="font-medium text-ink">{data.certificate.certificationName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Attempt</span>
                <span className="font-medium text-ink">#{data.certificate.attemptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Completed</span>
                <span className="font-medium text-ink">{toDate(data.certificate.completedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Certificate ID</span>
                <span className="font-mono text-xs font-medium text-ink">{data.certificate.id}</span>
              </div>
            </div>

            <p className="mt-5 text-xs text-ink-faint">
              This certificate confirms completion of independent exam-preparation content on HelpCertify. It is not
              issued by, affiliated with, or a guarantee of certification from any third-party certifying body.
            </p>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-brand-ink hover:underline">
            ← Back to HelpCertify
          </Link>
        </div>
      </div>
    </div>
  );
}
