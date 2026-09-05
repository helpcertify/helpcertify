import { Link } from 'react-router-dom';
import { CertificationPrepCard } from '@/components/common/CertificationPrepCard';
import { useCertificationCatalog } from '../api/certificationCatalogApi';

// "Prepare for Your Certification" - the browse-and-buy grid on the learner
// home page. Driven entirely by the certification catalog (product data);
// each card is equal-height with a bottom-aligned CTA. Replaces the old
// full-width "Choose Your Exam Preparation" stack of CertificationCards.
export function CertificationPrepSection() {
  const { data: catalog, isLoading, error, refetch } = useCertificationCatalog();

  const certs = catalog?.certifications ?? [];

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Prepare for Your Certification</h2>
          <p className="mt-0.5 text-sm text-ink-faint">
            Get exam-ready with practice questions, mock exams and more.
          </p>
        </div>
        <Link
          to="/home/practice-tests"
          className="shrink-0 text-xs font-semibold text-brand-ink hover:underline"
        >
          See all &rarr;
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface-raised" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-ink-faint">
          We couldn't load the available certification packages.{' '}
          <button type="button" onClick={() => refetch()} className="font-semibold text-brand-ink hover:underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && certs.length === 0 && (
        <p className="text-sm text-ink-faint">No certification packages are available right now.</p>
      )}

      {!isLoading && !error && certs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {certs.map((cert) => (
            <CertificationPrepCard key={cert.id} certification={cert} />
          ))}
        </div>
      )}
    </section>
  );
}
