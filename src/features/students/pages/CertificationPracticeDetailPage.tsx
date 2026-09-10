import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, EmptyState, DataTable, StatCard, type TabItem } from '@/components/ui';
import { CertificationPlansModal } from '@/components/common/CertificationPlansModal';
import { usePracticeSeries } from '../hooks/useExamSeries';
import { bankBuckets, weakAreaCount } from '../lib/practiceStats';
import { ExamDetailHeader, PracticeSetRow, pad2 } from '../components/exam';

type TabId = 'sets' | 'topics' | 'history' | 'analytics';

// Per-certification Practice Exams detail page. Read-only aggregation over
// the same practiceProgress / purchases reads the browse page uses - no
// backend changes. Each Practice Set row routes into the existing take /
// per-item review flow unchanged.
export function CertificationPracticeDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const { series, isLoading } = usePracticeSeries();
  const [tab, setTab] = useState<TabId>('sets');
  const [plansOpen, setPlansOpen] = useState(false);

  const s = useMemo(() => series.find((x) => x.seriesId === seriesId), [series, seriesId]);

  if (isLoading && !s) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (!s) {
    return (
      <EmptyState
        title="Practice series not found"
        hint="It may have been unpublished."
        action={
          <a href="/home/practice-tests" className="text-sm font-semibold text-brand-ink hover:underline">
            Back to Practice Exams
          </a>
        }
      />
    );
  }

  const answered = s.answeredUnique;
  const ownedTotal = s.ownedTotalQuestions || s.totalQuestions;
  const remaining = Math.max(0, ownedTotal - answered);
  const setsCompleted = s.sets.filter((x) => x.status === 'completed').length;
  const buckets = bankBuckets(s.progress, ownedTotal);

  const tabs: TabItem<TabId>[] = [
    { id: 'sets', label: 'Practice Sets' },
    { id: 'topics', label: 'Topic Performance' },
    { id: 'history', label: 'Question History' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <ExamDetailHeader
        backTo="/home/practice-tests"
        backLabel="Back to Practice Exams"
        title={`${s.cert.name} Practice Exams`}
        provider={s.cert.provider}
        description={s.cert.description}
        coverImageUrl={s.cert.coverImageUrl}
        iconKey={s.cert.iconKey}
        favorite={{ itemType: 'practiceTest', itemId: s.sets[0]?.itemId ?? '' }}
        metrics={[
          { label: 'Total Questions', value: s.totalQuestions.toLocaleString() },
          { label: 'Practice Sets', value: s.sets.length },
          { label: 'Questions Practiced', value: answered.toLocaleString() },
          { label: 'Questions Remaining', value: remaining.toLocaleString() },
        ]}
        progressPct={ownedTotal > 0 ? (answered / ownedTotal) * 100 : 0}
        progressLabel={`${answered.toLocaleString()} / ${ownedTotal.toLocaleString()} practiced`}
        accuracy={s.practiceAccuracyPct != null ? { label: 'Accuracy', value: s.practiceAccuracyPct } : null}
      />

      <div className="mt-6">
        <Tabs items={tabs} value={tab} onChange={setTab} />

        <div className="mt-4">
          {tab === 'sets' && (
            <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-raised shadow-card">
              {s.sets.map((set) => (
                <PracticeSetRow
                  key={set.itemId}
                  set={{
                    testId: set.itemId,
                    index: set.index,
                    totalQuestions: set.totalQuestions,
                    answered: set.answered,
                    accuracyPct: set.setAccuracyPct,
                    status: set.status,
                  }}
                  takeHref={
                    set.status === 'completed'
                      ? `/home/practice-tests/${set.itemId}`
                      : `/practice-tests/${set.itemId}/take`
                  }
                  onViewPlans={() => setPlansOpen(true)}
                />
              ))}
            </div>
          )}

          {tab === 'topics' && (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
              <EmptyState
                title="No topic breakdown yet"
                hint="Domain-level performance appears here once the questions in this bank are tagged with a topic. Until then, open a practice set for its own question-level review."
              />
            </div>
          )}

          {tab === 'history' && (
            <QuestionHistoryTab series={s} />
          )}

          {tab === 'analytics' && (
            <>
              {answered === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
                  <EmptyState
                    title="No analytics yet"
                    hint="Answer some questions and your accuracy, weak areas and mastery breakdown will show up here."
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="Sets completed" value={`${setsCompleted} / ${s.sets.length}`} />
                  <StatCard label="Overall accuracy" value={s.practiceAccuracyPct != null ? `${s.practiceAccuracyPct}%` : '-'} />
                  <StatCard label="Weak areas" value={weakAreaCount(s.progress)} />
                  <StatCard label="Questions practiced" value={answered.toLocaleString()} />
                  <StatCard label="Mastered" value={buckets.mastered} />
                  <StatCard label="Learning" value={buckets.learning} />
                  <StatCard label="Needs review" value={buckets.needsReview} />
                  <StatCard label="Unseen" value={buckets.unseen} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {plansOpen && <CertificationPlansModal certification={s.cert} onClose={() => setPlansOpen(false)} />}
    </div>
  );
}

function QuestionHistoryTab({ series }: { series: ReturnType<typeof usePracticeSeries>['series'][number] }) {
  const rows = series.sets.filter((set) => set.owned && set.answered > 0);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
        <EmptyState title="Nothing answered yet" hint="Start a practice set and your per-set history will build up here." />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-0 shadow-card">
      <DataTable
        head={
          <>
            <th>Practice Set</th>
            <th>Answered</th>
            <th>Accuracy</th>
            <th>Status</th>
          </>
        }
      >
        {rows.map((set) => (
          <tr key={set.itemId}>
            <td className="font-medium text-ink">Practice Set {pad2(set.index)}</td>
            <td>
              {set.answered} / {set.totalQuestions}
            </td>
            <td>{set.setAccuracyPct != null ? `${set.setAccuracyPct}%` : '-'}</td>
            <td className="capitalize">{set.status.replace('_', ' ')}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
