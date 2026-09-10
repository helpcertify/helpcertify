import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader, EmptyState } from '@/components/ui';
import type { CatalogCertification } from '../../api/certificationCatalogApi';
import type { ExamSeries } from '../../hooks/useExamSeries';
import { CertificationPlansModal } from '@/components/common/CertificationPlansModal';
import { ExamProductCard, type ExamCardModel } from './ExamProductCard';
import { ExamBrowseControls } from './ExamBrowseControls';
import { matchesTab, type ExamBrowseTab, type ExamLayout } from './browseFilter';
import type { ExamKind } from './examCta';

function toCardModel(s: ExamSeries, kind: ExamKind): ExamCardModel {
  const practice = kind === 'practice';
  return {
    certId: s.cert.id,
    seriesId: s.seriesId,
    name: `${s.cert.name} ${practice ? 'Practice Exams' : 'Mock Exams'}`,
    provider: s.cert.provider,
    coverImageUrl: s.cert.coverImageUrl,
    iconKey: s.cert.iconKey,
    kind,
    status: s.status,
    totalQuestions: s.totalQuestions,
    setCount: s.sets.length,
    progressCurrent: practice ? s.answeredUnique : s.mocksCompleted,
    progressTotal: practice ? s.ownedTotalQuestions || s.totalQuestions : s.sets.length,
    progressUnit: practice ? 'questions' : 'mock exams',
    accuracyPct: practice ? s.practiceAccuracyPct : s.bestScorePct,
    accuracyLabel: practice ? 'Accuracy' : 'Best score',
    fromPrice: s.fromPrice,
    currency: s.currency,
    favoriteItemId: s.sets[0]?.itemId ?? s.seriesId,
  };
}

// Shared body for the Practice Exams and Mock Exams browse pages: header,
// filter/search/layout controls, and the responsive certification card
// grid. `topSlot` is the practice page's resume banner + study-goal row.
export function ExamBrowsePage({
  kind,
  title,
  subtitle,
  series,
  isLoading,
  isError,
  onRetry,
  detailBase,
  topSlot,
}: {
  kind: ExamKind;
  title: string;
  subtitle: string;
  series: ExamSeries[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  detailBase: string;
  topSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<ExamBrowseTab>('all');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<ExamLayout>('grid');
  const [plansFor, setPlansFor] = useState<CatalogCertification | null>(null);

  const models = useMemo(() => series.map((s) => ({ s, model: toCardModel(s, kind) })), [series, kind]);

  const counts = useMemo(() => {
    const c: Record<ExamBrowseTab, number> = { all: 0, available: 0, in_progress: 0, completed: 0 };
    for (const { model } of models) {
      c.all += 1;
      if (matchesTab('available', model.status)) c.available += 1;
      if (matchesTab('in_progress', model.status)) c.in_progress += 1;
      if (matchesTab('completed', model.status)) c.completed += 1;
    }
    return c;
  }, [models]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter(({ model }) => {
      if (!matchesTab(tab, model.status)) return false;
      if (q && !`${model.name} ${model.provider}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, tab, search]);

  return (
    <div className="mx-auto w-full max-w-[1640px]">
      <PageHeader title={title} description={subtitle} />

      {topSlot}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-surface-border bg-surface-raised" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-surface-border bg-surface-raised p-6 text-sm text-ink-faint">
          We couldn&apos;t load your exams.{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-brand-ink hover:underline">
            Retry
          </button>
        </div>
      ) : models.length === 0 ? (
        <EmptyState
          title={`No ${kind === 'practice' ? 'practice exams' : 'mock exams'} yet`}
          hint="New certification prep is added regularly. Check back soon."
        />
      ) : (
        <>
          <ExamBrowseControls
            tab={tab}
            onTab={setTab}
            counts={counts}
            search={search}
            onSearch={setSearch}
            layout={layout}
            onLayout={setLayout}
          />

          {visible.length === 0 ? (
            <EmptyState title="Nothing matches this filter" hint="Try a different tab or clear the search." />
          ) : layout === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map(({ s, model }) => (
                <ExamProductCard
                  key={s.seriesId}
                  model={model}
                  detailHref={`${detailBase}/${s.seriesId}`}
                  onViewPlans={() => setPlansFor(s.cert)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map(({ s, model }) => (
                <ExamProductCard
                  key={s.seriesId}
                  model={model}
                  layout="list"
                  detailHref={`${detailBase}/${s.seriesId}`}
                  onViewPlans={() => setPlansFor(s.cert)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {plansFor && <CertificationPlansModal certification={plansFor} onClose={() => setPlansFor(null)} />}
    </div>
  );
}
