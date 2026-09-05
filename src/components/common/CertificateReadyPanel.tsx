import { useState } from 'react';
import { Link } from 'react-router-dom';
import { certificatesApi, type Certificate } from '@/features/admin/api/resultsApi';
import { useUiStore } from '@/store/useUiStore';
import { CertificateViewModal } from './CertificateViewModal';
import { errorText } from '@/lib/errorMessages';

interface Props {
  certificate: Certificate;
  dashboardHref: string;
}

// "Your completion certificate is ready" - shown immediately on the
// results page once a certificate has been issued (or re-fetched, since
// issuance is idempotent) for the attempt just finished.
export function CertificateReadyPanel({ certificate, dashboardHref }: Props) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await certificatesApi.downloadCertificatePdf(certificate.id);
    } catch (err) {
      pushToast(errorText(err, 'Could not download the certificate'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    try {
      await certificatesApi.printCertificatePdf(certificate.id);
    } catch (err) {
      pushToast(errorText(err, 'Could not open the certificate for printing'), 'error');
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-brand-500/30 bg-gradient-to-r from-brand-50 to-surface-sunken p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🎓
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">Your completion certificate is ready</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          View Certificate
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={handleDownload}
          className="rounded-lg border border-brand-500/50 px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <button type="button" onClick={handlePrint} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">
          Print Certificate
        </button>
        <Link
          to={`/verify/${certificate.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted"
        >
          Verify Certificate
        </Link>
        <Link to={dashboardHref} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">
          Return to Dashboard
        </Link>
      </div>

      {viewing && (
        <CertificateViewModal
          certificate={certificate}
          onClose={() => setViewing(false)}
          onDownload={handleDownload}
          onPrint={handlePrint}
          downloading={downloading}
        />
      )}
    </div>
  );
}
