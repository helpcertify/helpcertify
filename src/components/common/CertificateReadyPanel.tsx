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
    <div className="mb-6 rounded-xl border border-[#BFDBFE] bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFF] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🎓
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#155EEF]">Your completion certificate is ready</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB]"
        >
          View Certificate
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={handleDownload}
          className="rounded-lg border border-[#155EEF]/50 px-4 py-2 text-sm font-semibold text-[#155EEF] disabled:opacity-50"
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
