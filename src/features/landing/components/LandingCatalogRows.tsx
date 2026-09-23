import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';
import { formatMoney } from '@/utils/currency';
import type { PublicCatalog } from '../api/publicCatalogApi';

// The JS-rendered catalog carousels on the landing page. Deliberately NOT
// prerendered: this component is reached only through a lazy() boundary in
// LandingPage, and it pulls the catalog through a dynamic import() of
// publicCatalogApi (which loads Firebase/vercelApi at module scope) so the
// build-time prerender module graph never evaluates it. Cards are their
// own lightweight markup - no ProductCardShell / WishlistButton, which
// assume a signed-in student - and every card routes a logged-out visitor
// to /register.

interface Card {
  id: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  coverImageUrl: string | null;
}

function toCourseCard(c: PublicCatalog['courses'][number]): Card {
  return {
    id: c.id,
    title: c.title,
    subtitle: `${c.category} - ${c.totalLessons} lesson${c.totalLessons === 1 ? '' : 's'}`,
    priceLabel: c.price > 0 ? formatMoney(c.price, c.currency) : 'Free',
    coverImageUrl: c.coverImageUrl,
  };
}

function toCertCard(x: PublicCatalog['certifications'][number]): Card {
  return {
    id: x.id,
    title: x.name,
    subtitle: x.provider,
    priceLabel: x.fromPriceMinor > 0 ? `From ${formatMoney(x.fromPriceMinor, x.currency)}` : 'Free',
    coverImageUrl: null,
  };
}

function toReadinessCard(p: PublicCatalog['practiceTests'][number] | PublicCatalog['quizzes'][number]): Card {
  const questions = 'totalQuestions' in p ? p.totalQuestions : 0;
  return {
    id: p.id,
    title: p.title,
    subtitle: `${p.category} - ${questions} questions`,
    priceLabel: p.price > 0 ? formatMoney(p.price, p.currency) : 'Free',
    coverImageUrl: null,
  };
}

function Row({ title, subtitle, cards }: { title: string; subtitle: string; cards: Card[] }) {
  const { ref, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroll(cards.length);
  if (cards.length === 0) return null;
  return (
    <section className="border-t border-surface-border py-14">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-faint">{subtitle}</p>
        <div className="relative mt-6">
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
          <div ref={ref} className="scrollbar-none flex items-stretch gap-4 overflow-x-auto scroll-smooth pb-1">
            {cards.map((c) => (
              <Link
                key={c.id}
                to="/register"
                className="flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-[#DCE7FF] bg-white text-left shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-[3px] hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72 dark:bg-surface-raised"
              >
                {c.coverImageUrl ? (
                  <img src={c.coverImageUrl} alt="" className="h-32 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-32 w-full bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]" />
                )}
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">{c.subtitle}</div>
                  <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{c.title}</h3>
                  <div className="mt-auto pt-3 text-sm font-bold text-ink">{c.priceLabel}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingCatalogRows() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import('../api/publicCatalogApi')
      .then((m) => m.getPublicCatalog())
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;

  if (!catalog) {
    return (
      <section className="border-t border-surface-border py-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="h-7 w-64 rounded bg-surface-raised" />
          <div className="mt-6 flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-56 w-60 shrink-0 rounded-[14px] border border-surface-border bg-surface-raised sm:w-72" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Row
        title="Featured courses"
        subtitle="Written lessons you can start reading the moment you sign up."
        cards={catalog.courses.slice(0, 12).map(toCourseCard)}
      />
      <Row
        title="Prepare for your certification"
        subtitle="Practice-question banks and mock exams mapped to the real exam blueprint."
        cards={catalog.certifications.slice(0, 12).map(toCertCard)}
      />
      <Row
        title="Test your readiness"
        subtitle="Timed practice exams and full mock exams with a per-question breakdown."
        cards={[...catalog.practiceTests, ...catalog.quizzes].slice(0, 12).map(toReadinessCard)}
      />
    </>
  );
}
