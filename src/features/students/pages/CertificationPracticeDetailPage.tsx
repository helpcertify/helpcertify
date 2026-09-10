import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, EmptyState, DataTable, StatCard, type TabItem } from '@/components/ui';
import { CertificationPlansModal } from '@/components/common/CertificationPlansModal';
import { usePracticeSeries, type ExamSeries } from '../hooks/useExamSeries';
import { usePracticeQuestionBank, groupByDomain, type BankQuestion } from '../hooks/usePracticeQuestionBank';
import { bankBuckets, weakAreaCount } from '../lib/practiceStats';
import { ExamDetailHeader, PracticeSetRow, ExamProgressBar } from '../components/exam';

type TabId = 'sets' | 'topics' | 'history' | 'analytics';

const HISTORY_ROW_CAP = 200;

// Per-certification Practice Exams detail page. Read-only aggregation over
// the same practiceProgress / purchases reads the browse page uses, plus a
// lazy question-bank read (gated to the Topic / History tabs) for the
// domain and per-question views. No backend changes; each Practice Set row
// routes into the existing take / per-item review flow unchanged.
export function CertificationPracticeDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const { series, isLoading } = usePracticeSeries();
  const [tab, setTab] = useState<TabId>('sets');
  const [plansOpen, setPlansOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');

  const s = useMemo(() => series.find((x) => x.seriesId === seriesId), [series, seriesId]);

  const ownedBankIds = useMemo(() => (s?.sets ?? []).filter((x) => x.owned).map((x) => x.itemId), [s]);
  const bankQ = usePracticeQuestionBank(ownedBankIds, tab === 'topics' || tab === 'history');

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
            <TopicPerformanceTab series={s} bankLoading={bankQ.isLoading} bank={bankQ.data} />
          )}

          {tab === 'history' && (
            <QuestionHistoryTab
              series={s}
              bankLoading={bankQ.isLoading}
              bank={bankQ.data}
              search={historyQuery}
              onSearch={setHistoryQuery}
            />
          )}

          {tab === 'analytics' &&
            (answered === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">
                <EmptyState
                  title="No analytics yet"
                  hint="Answer some questions and your accuracy, weak areas and mastery breakdown will show up here."
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Sets completed" value={`${setsCompleted} / ${s.sets.length}`} />
                <StatCard
                  label="Overall accuracy"
                  value={s.practiceAccuracyPct != null ? `${s.practiceAccuracyPct}%` : '-'}
                />
                <StatCard label="Weak areas" value={weakAreaCount(s.progress)} />
                <StatCard label="Questions practiced" value={answered.toLocaleString()} />
                <StatCard label="Mastered" value={buckets.mastered} />
                <StatCard label="Learning" value={buckets.learning} />
                <StatCard label="Needs review" value={buckets.needsReview} />
                <StatCard label="Unseen" value={buckets.unseen} />
              </div>
            ))}
        </div>
      </div>

      {plansOpen && <CertificationPlansModal certification={s.cert} onClose={() => setPlansOpen(false)} />}
    </div>
  );
}

function DashedCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised">{children}</div>;
}

function TopicPerformanceTab({
  series,
  bankLoading,
  bank,
}: {
  series: ExamSeries;
  bankLoading: boolean;
  bank: Map<string, BankQuestion> | undefined;
}) {
  if (bankLoading || !bank) {
    return <p className="px-1 py-6 text-sm text-ink-faint">Loading topic breakdown…</p>;
  }
  const { domains, untagged, anyTagged } = groupByDomain(series.progress.questionStats, bank);
  if (!anyTagged) {
    return (
      <DashedCard>
        <EmptyState
          title="No topic breakdown yet"
          hint="Domain-level performance appears here once the questions in this bank are tagged with a topic. An admin can bulk-tag them from the practice bank editor."
        />
      </DashedCard>
    );
  }
  if (domains.length === 0) {
    return (
      <DashedCard>
        <EmptyState title="Nothing practised yet" hint="Answer questions across the sets and your per-topic accuracy builds up here." />
      </DashedCard>
    );
  }
  return (
    <div className="space-y-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card">
      {domains.map((d) => (
        <div key={d.domain}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-ink">{d.domain}</span>
            <span className="shrink-0 text-ink-faint [font-variant-numeric:tabular-nums]">
              {d.correct}/{d.attempted} · {d.accuracyPct}%
            </span>
          </div>
          <ExamProgressBar pct={d.accuracyPct} />
        </div>
      ))}
      {untagged > 0 && <p className="pt-1 text-xs text-ink-faint">{untagged} answered question(s) have no topic tag.</p>}
    </div>
  );
}

function QuestionHistoryTab({
  series,
  bankLoading,
  bank,
  search,
  onSearch,
}: {
  series: ExamSeries;
  bankLoading: boolean;
  bank: Map<string, BankQuestion> | undefined;
  search: string;
  onSearch: (v: string) => void;
}) {
  const incorrect = useMemo(() => new Set(series.progress.incorrectQuestionIds), [series.progress]);
  const allRows = useMemo(() => {
    const stats = series.progress.questionStats;
    return Object.entries(stats)
      .filter(([, v]) => v.attempts > 0)
      .map(([qid, v]) => {
        const q = bank?.get(qid);
        return {
          qid,
          text: q?.questionText ?? '(question text unavailable)',
          domain: q?.domain ?? null,
          attempts: v.attempts,
          accuracyPct: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : 0,
          lastCorrect: !incorrect.has(qid),
        };
      })
      .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempts - a.attempts);
  }, [series.progress, bank, incorrect]);

  if (allRows.length === 0) {
    return (
      <DashedCard>
        <EmptyState title="Nothing answered yet" hint="Start a practice set and every question you answer is logged here." />
      </DashedCard>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allRows.filter((r) => `${r.text} ${r.domain ?? ''}`.toLowerCase().includes(q))
    : allRows;
  const shown = filtered.slice(0, HISTORY_ROW_CAP);

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search your answered questions…"
        aria-label="Search answered questions"
        className="input-dark w-full sm:w-80"
      />
      {bankLoading && <p className="text-xs text-ink-faint">Loading question text…</p>}
      <div className="rounded-xl border border-surface-border bg-surface-raised p-0 shadow-card">
        <DataTable
          head={
            <>
              <th>Question</th>
              <th>Topic</th>
              <th>Attempts</th>
              <th>Accuracy</th>
              <th>Last</th>
            </>
          }
        >
          {shown.map((r) => (
            <tr key={r.qid}>
              <td className="max-w-md text-ink">
                <span className="line-clamp-2">{r.text}</span>
              </td>
              <td>{r.domain ?? '-'}</td>
              <td>{r.attempts}</td>
              <td>{r.accuracyPct}%</td>
              <td className={r.lastCorrect ? 'text-success' : 'text-danger'}>{r.lastCorrect ? 'Correct' : 'Incorrect'}</td>
            </tr>
          ))}
        </DataTable>
      </div>
      {filtered.length > shown.length && (
        <p className="text-xs text-ink-faint">
          Showing {shown.length} of {filtered.length}. Narrow the search to see more.
        </p>
      )}
    </div>
  );
}
