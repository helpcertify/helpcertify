import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contentAdminApi } from '../api/contentAdminApi';
import { QuestionEditorList } from '../components/QuestionEditorList';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';

// Practice Manager had no "View" page at all before this - the answer key
// was only reachable for quizzes. Same treatment as QuizAnswerKeyPage:
// read-only preview plus inline per-question editing, plus a bulk
// "Auto-tag domains with AI" run that feeds the learner Topic Performance tab.
export function PracticeTestAnswerKeyPage() {
  const { testId } = useParams<{ testId: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'practiceTestAnswerKey', testId],
    queryFn: () => contentAdminApi.getPracticeTestAnswerKey(testId!),
    enabled: !!testId,
  });

  const [domainsInput, setDomainsInput] = useState('');
  const [tagging, setTagging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runAutoTag = async () => {
    if (!testId || tagging) return;
    setTagging(true);
    setProgress({ done: 0, total: 0 });
    const domains = domainsInput
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      let offset: number | null = 0;
      let taggedTotal = 0;
      let used: string[] = [];
      while (offset !== null) {
        const res = await contentAdminApi.autoTagPracticeDomains({
          bankId: testId,
          offset,
          ...(domains.length ? { domains } : {}),
        });
        taggedTotal += res.tagged;
        used = res.domainsUsed;
        setProgress({ done: Math.min(res.total, (offset ?? 0) + 80), total: res.total });
        offset = res.nextOffset;
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTestAnswerKey', testId] });
      pushToast(`Tagged ${taggedTotal} question(s) across ${used.length} domain(s)`, 'success');
    } catch (err) {
      pushToast(errorText(err, 'Auto-tagging failed'), 'error');
    } finally {
      setTagging(false);
      setProgress(null);
    }
  };

  if (isLoading) return <p className="text-ink-faint">Loading…</p>;
  if (!data) return <p className="text-ink-faint">Practice test not found.</p>;

  const { practiceTest, questions } = data;
  const taggedCount = questions.filter((q) => q.domain && q.domain.trim()).length;

  return (
    <div>
      <Link to="/admin/practice-tests" className="mb-4 inline-block text-sm text-brand-ink">
        &larr; Back to Practice Exams
      </Link>
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h1 className="text-2xl font-bold text-ink">{practiceTest.title}</h1>
        <div className="mt-1 space-y-0.5 text-sm text-ink-faint">
          <div>
            Session duration:{' '}
            {practiceTest.durationPerSessionMinutes ? `${practiceTest.durationPerSessionMinutes} minutes` : 'Learner chooses'}
          </div>
          <div>Default initial batch size: {practiceTest.defaultInitialBatchSize}</div>
        </div>

        <div className="mt-5 rounded-lg border border-surface-border bg-surface-sunken p-4">
          <div className="text-sm font-semibold text-ink">Domain tagging</div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {taggedCount} of {questions.length} question{questions.length === 1 ? '' : 's'} tagged. Auto-tagging fills in the
            rest with AI so learners get a Topic Performance breakdown. Leave the box blank to let the AI infer the domains, or
            list them comma-separated to constrain it.
          </p>
          <input
            value={domainsInput}
            onChange={(e) => setDomainsInput(e.target.value)}
            placeholder="e.g. Information Security Governance, Risk Management, Program Development"
            className="input-dark mt-3 w-full"
            disabled={tagging}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={runAutoTag}
              disabled={tagging}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {tagging ? 'Tagging…' : 'Auto-tag domains with AI'}
            </button>
            {progress && (
              <span className="text-xs text-ink-faint">
                {progress.done} / {progress.total}
              </span>
            )}
          </div>
        </div>

        <QuestionEditorList
          questions={questions}
          onSave={async (questionId, saveData) => {
            try {
              await contentAdminApi.updatePracticeTestQuestion({ testId: testId!, questionId, ...saveData });
              pushToast('Question updated', 'success');
              queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTestAnswerKey', testId] });
            } catch (err) {
              pushToast(errorText(err, 'Could not update question'), 'error');
            }
          }}
        />
      </div>
    </div>
  );
}
