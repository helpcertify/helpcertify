import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Tabs, EmptyState, DataTable, StatCard, type TabItem } from '@/components/ui';
import { CertificationPlansModal } from '@/components/common/CertificationPlansModal';
import { toDate } from '@/utils/formatDate';
import { useMockSeries, useMyMockAttempts } from '../hooks/useExamSeries';
import { ExamDetailHeader, MockExamRow, ScoreTrend, CertificationPurchasePanel, formatDuration, pad2 } from '../components/exam';

type TabId = 'mocks' | 'performance' | 'reviews';

// Per-certification Mock Exams detail page. Same read-only aggregation
// approach as the practice detail page; every row routes into the existing
// take / results flow, timers and scoring untouched.
export function CertificationMockDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const { series, isLoading } = useMockSeries();
  const { data: attempts = [] } = useMyMockAttempts();
  const [tab, setTab] = useState<TabId>('mocks');
  const [plansOpen, setPlansOpen] = useState(false);

  const s = useMemo(() => series.find((x) => x.seriesId === seriesId), [series, seriesId]);
  const seriesQuizIds = useMemo(() => new Set(s?.sets.map((x) => x.itemId) ?? []), [s]);
  const seriesAttempts = useMemo(
    () =>
      attempts
        .filter((a) => seriesQuizIds.has(a.quizId) && a.status !== 'in_progress')
        .sort((a, b) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0)),
    [attempts, seriesQuizIds],
  );

  if (isLoading && !s) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (!s) {
    return (
      <EmptyState
        title="Mock series not found"
        hint="It may have been unpublished."
        action={
          <a href="/home/mock-exams" className="text-sm font-semibold text-brand-ink hover:underline">
            Back to Mock Exams
          </a>
        }
      />
    );
  }

  const perExam = s.sets[0]?.totalQuestions ?? 0;
  const duration = s.sets[0]?.durationMinutes ?? 0;
  const scores = seriesAttempts.map((a) => a.scorePct).filter((v): v is number => v != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const tabs: TabItem<TabId>[] = [
    { id: 'mocks', label: 'Mock Exams' },
    { id: 'performance', label: 'Performance' },
    { id: 'reviews', label: 'Review History' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <ExamDetailHeader
        backTo="/home/mock-exams"
        backLabel="Back to Mock Exams"
        title={`${s.cert.name} Mock Exams`}
        provider={s.cert.provider}
        description={
          s.cert.description || 'Experience real exam conditions with full-length mock exams. Answers are shown after submission.'
        }
        coverImageUrl={s.cert.coverImageUrl}
        iconKey={s.cert.iconKey}
        favorite={{ itemType: 'quiz', itemId: s.sets[0]?.itemId ?? '' }}
        metrics={[
          { label: 'Mock Exams', value: s.sets.length },
          { label: 'Questions / Exam', value: perExam || '-' },
          { label: 'Exam Duration', value: formatDuration(duration) },
          { label: 'Completed', value: `${s.mocksCompleted} / ${s.sets.length}` },
        ]}
        progressPct={s.sets.length > 0 ? (s.mocksCompleted / s.sets.length) * 100 : 0}
        progressLabel={`${s.mocksCompleted} / ${s.sets.length} completed`}
        accuracy={s.bestScorePct != null ? { label: 'Best score', value: s.bestScorePct } : null}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <aside className="order-1 lg:order-2 lg:sticky lg:top-4">
          <CertificationPurchasePanel cert={s.cert} favoriteItemType="quiz" favoriteItemId={s.sets[0]?.itemId ?? ''} />
        </aside>

        <div className="order-2 min-w-0 lg:order-1">
          <Tabs items={tabs} value={tab} onChange={setTab} />

          <div className="mt-4">
            {tab === 'mocks' && (
            <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-raised shadow-card">
              {s.sets.map((set) => (
                <MockExamRow
                  key={set.itemId}
                  mock={{
                    quizId: set.itemId,
                    index: set.index,
                    totalQuestions: set.totalQuestions,
                    durationMinutes: set.durationMinutes,
                    status: set.status,
                    scorePct: set.scorePct,
                  }}
                  takeHref={`/quizzes/${set.itemId}/take`}
                  resultHref={`/home/past-quizzes/${set.itemId}`}
                  onViewPlans={() => setPlansOpen(true)}
                />
              ))}
            </div>
          )}

          {tab === 'performance' &&
            (seriesAttempts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
                <EmptyState title="No attempts yet" hint="Finish a mock exam and your score trend will show up here." />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Best score" value={s.bestScorePct != null ? `${s.bestScorePct}%` : '-'} />
                  <StatCard label="Latest score" value={scores[0] != null ? `${scores[0]}%` : '-'} />
                  <StatCard label="Average score" value={avgScore != null ? `${avgScore}%` : '-'} />
                </div>
                <ScoreTrend
                  className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card"
                  points={[...seriesAttempts]
                    .filter((a) => a.scorePct != null)
                    .reverse()
                    .map((a) => ({
                      label: a.submittedAtMs
                        ? toDate(a.submittedAtMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                        : '',
                      scorePct: a.scorePct as number,
                    }))}
                />
                <div className="rounded-xl border border-surface-border bg-surface-raised p-0 shadow-card">
                  <DataTable
                    head={
                      <>
                        <th>Mock</th>
                        <th>Score</th>
                        <th>Correct</th>
                        <th>Submitted</th>
                      </>
                    }
                  >
                    {seriesAttempts.map((a) => {
                      const set = s.sets.find((x) => x.itemId === a.quizId);
                      return (
                        <tr key={a.attemptId}>
                          <td className="font-medium text-ink">Mock Exam {set ? pad2(set.index) : ''}</td>
                          <td>{a.scorePct != null ? `${a.scorePct}%` : '-'}</td>
                          <td>
                            {a.correctCount} / {a.totalQuestions}
                          </td>
                          <td>{a.submittedAtMs ? toDate(a.submittedAtMs).toLocaleDateString() : '-'}</td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </div>
              </div>
            ))}

          {tab === 'reviews' &&
            (seriesAttempts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
                <EmptyState title="Nothing to review yet" hint="Submitted mock exams appear here with a link to the full breakdown." />
              </div>
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface-raised p-0 shadow-card">
                <DataTable
                  head={
                    <>
                      <th>Mock</th>
                      <th>Score</th>
                      <th>Time taken</th>
                      <th>Submitted</th>
                      <th />
                    </>
                  }
                >
                  {seriesAttempts.map((a) => {
                    const set = s.sets.find((x) => x.itemId === a.quizId);
                    const mins = a.durationSeconds != null ? Math.round(a.durationSeconds / 60) : null;
                    return (
                      <tr key={a.attemptId}>
                        <td className="font-medium text-ink">Mock Exam {set ? pad2(set.index) : ''}</td>
                        <td>{a.scorePct != null ? `${a.scorePct}%` : '-'}</td>
                        <td>{mins != null ? `${mins} min` : '-'}</td>
                        <td>{a.submittedAtMs ? toDate(a.submittedAtMs).toLocaleDateString() : '-'}</td>
                        <td>
                          <Link to={`/home/past-quizzes/${a.quizId}`} className="text-sm font-semibold text-brand-ink hover:underline">
                            View results
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              </div>
            ))}
          </div>
        </div>
      </div>

      {plansOpen && <CertificationPlansModal certification={s.cert} onClose={() => setPlansOpen(false)} />}
    </div>
  );
}
