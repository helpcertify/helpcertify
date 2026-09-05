import { Link } from 'react-router-dom';
import { CertificationPrepCard } from '@/components/common/CertificationPrepCard';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';

// "Prepare for Your Certification" - the browse-and-buy row on the learner
// home page. A horizontally scrolling row of fixed-width cards, identical in
// footprint to the "Courses to explore" / "New courses" rows. Driven
// entirely by the certification catalog (product data).
export function CertificationPrepSection() {
  const { data: catalog, isLoading, error, refetch } = useCertificationCatalog();
  const certs = catalog?.certifications ?? [];
  const { ref, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroll(certs.length);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Prepare for Your Certification</h2>
          <p className="mt-0.5 text-sm text-ink-faint">
            Get exam-ready with practice questions, mock exams and more.
          </p>
        </div>
        <Link to="/home/practice-tests" className="shrink-0 text-xs font-semibold text-brand-ink hover:underline">
          See all &rarr;
        </Link>
      </div>

      {isLoading && (
        <div className="flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 w-60 shrink-0 animate-pulse rounded-[14px] border border-surface-border bg-surface-raised sm:w-72" />
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
        <div className="relative">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
              className="absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-lg text-ink shadow-md hover:border-brand-400"
            >
              &lsaquo;
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
              className="absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-lg text-ink shadow-md hover:border-brand-400"
            >
              &rsaquo;
            </button>
          )}
          <div ref={ref} className="scrollbar-none flex items-stretch gap-3 overflow-x-auto scroll-smooth pb-1">
            {certs.map((cert) => (
              <CertificationPrepCard key={cert.id} certification={cert} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
