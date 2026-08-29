import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { certificatesApi, type Certificate } from '@/features/admin/api/resultsApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { CertificateViewModal } from '@/components/common/CertificateViewModal';

type TypeFilter = 'all' | 'quiz' | 'practiceTest';

const STATUS_BADGE: Record<Certificate['status'], string> = {
  issued: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  revoked: 'bg-red-500/15 text-red-500',
  superseded: 'bg-neutral-800 text-ink-faint',
  invalid: 'bg-neutral-800 text-ink-faint',
};

// My Certificates — every completion certificate this learner has earned,
// across both Mock Exams (quiz) and Practice Exams, with type + certification
// filters. Certificates are never deleted, only revoked/superseded, so a
// learner's full history always stays visible here (see api/results.ts's
// revokeCertificate).
export function MyCertificatesPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student', 'myCertificates'],
    queryFn: certificatesApi.getMyCertificates,
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [certFilter, setCertFilter] = useState('all');
  const [viewing, setViewing] = useState<Certificate | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const certificates = useMemo(() => data?.certificates ?? [], [data]);
  const certificationNames = useMemo(
    () => Array.from(new Set(certificates.map((c) => c.certificationName))).sort(),
    [certificates]
  );

  const filtered = certificates.filter((c) => {
    if (typeFilter !== 'all' && c.sourceType !== typeFilter) return false;
    if (certFilter !== 'all' && c.certificationName !== certFilter) return false;
    return true;
  });

  const handleDownload = async (cert: Certificate) => {
    setDownloadingId(cert.id);
    try {
      await certificatesApi.downloadCertificatePdf(cert.id);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not download the certificate', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrint = async (cert: Certificate) => {
    try {
      await certificatesApi.printCertificatePdf(cert.id);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not open the certificate for printing', 'error');
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">My Certificates</h1>
      <p className="mb-6 text-sm text-ink-faint">Every completion certificate you've earned, ready to view, download or print anytime.</p>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['all', 'quiz', 'practiceTest'] as TypeFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTypeFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              typeFilter === f ? 'border-[#155EEF] bg-[#EFF6FF] text-[#155EEF]' : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            {f === 'all' ? 'All Certificates' : f === 'quiz' ? 'Mock Certificates' : 'Practice Certificates'}
          </button>
        ))}
        {certificationNames.length > 1 && (
          <select value={certFilter} onChange={(e) => setCertFilter(e.target.value)} className="input-dark w-48">
            <option value="all">All certifications</option>
            {certificationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-surface-border bg-surface-raised" />
          ))}
        </div>
      )}
      {!isLoading && error && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-ink-faint">
          We couldn't load your certificates.{' '}
          <button type="button" onClick={() => refetch()} className="font-semibold text-[#155EEF] hover:underline">
            Retry
          </button>
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
          {certificates.length === 0
            ? 'No certificates yet, complete a Mock Exam or finish a Practice Test to earn your first one.'
            : 'No certificates match this filter.'}
        </p>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((cert) => (
            <div key={cert.id} className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-raised p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {cert.sourceType === 'quiz' ? 'Certificate of Mock Exam Completion' : 'Certificate of Practice Exam Completion'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[cert.status]}`}>
                    {cert.status === 'revoked' ? 'Certificate Revoked' : cert.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  {cert.sourceTitle} · {cert.certificationName} · {cert.sourceType === 'quiz' ? 'Mock' : 'Practice'} · Attempt #{cert.attemptNumber}
                </div>
                <div className="mt-1 text-xs text-ink-faint">
                  Completed {toDate(cert.completedAt).toLocaleDateString()}
                  {cert.scoreCorrect !== null && ` · Score ${cert.completionPercent}%`}
                  {' · '}
                  <span className="font-mono">{cert.id}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => setViewing(cert)} className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-brand-400">
                  View
                </button>
                <button
                  type="button"
                  disabled={cert.status === 'revoked' || downloadingId === cert.id}
                  onClick={() => handleDownload(cert)}
                  className="rounded-lg bg-[#155EEF] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {downloadingId === cert.id ? 'Preparing…' : 'Download PDF'}
                </button>
                <button
                  type="button"
                  disabled={cert.status === 'revoked'}
                  onClick={() => handlePrint(cert)}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted disabled:opacity-50"
                >
                  Print
                </button>
                <a
                  href={`/verify/${cert.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted"
                >
                  Verify
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <CertificateViewModal
          certificate={viewing}
          onClose={() => setViewing(null)}
          onDownload={() => handleDownload(viewing)}
          onPrint={() => handlePrint(viewing)}
          downloading={downloadingId === viewing.id}
        />
      )}
    </div>
  );
}
