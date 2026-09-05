import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { CategorySelect } from '@/components/common/CategorySelect';
import { majorToMinor } from '@/utils/currency';
import { aiCourseBuilderApi, type AiOutlineModule, type AiParsedQuestion } from '../api/aiCourseBuilderApi';
import { catalogSubmissionAdminApi } from '../api/catalogSubmissionApi';
import type { SkillLevel } from '@/types/models';

// Shared by TrainerWorkspacePage, CreatorWorkspacePage, and (via
// isAdmin) CreatorAdminPage - describe a course, let OpenAI propose a
// module outline, review/edit it, generate real exam questions per
// module, then either submit for admin review (Trainer/Creator) or
// publish straight away (Admin - see api/content-admin.ts's
// submitAiCourseDraft, which auto-approves an admin's own draft).
// Renders nothing if the account isn't granted access to this feature -
// see the admin Settings page's Feature Access card.
export function AiCourseBuilderFlow({ isAdmin = false }: { isAdmin?: boolean }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { data: access } = useQuery({ queryKey: ['aiCourseBuilder', 'myAccess'], queryFn: aiCourseBuilderApi.checkMyAccess });
  const { data: usage } = useQuery({ queryKey: ['aiCourseBuilder', 'myUsage'], queryFn: aiCourseBuilderApi.getMyUsage });

  const [topic, setTopic] = useState('');
  const [itemType, setItemType] = useState<'quiz' | 'practiceTest' | 'course'>('quiz');
  const [category, setCategory] = useState('Other');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Foundation');
  const [moduleCount, setModuleCount] = useState('5');

  const [draftId, setDraftId] = useState<string | null>(null);
  const [outline, setOutline] = useState<AiOutlineModule[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<string, AiParsedQuestion[]> | null>(null);
  const [generatedLessons, setGeneratedLessons] = useState<Record<string, string> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const isCourse = itemType === 'course';
  const hasContent = generatedQuestions !== null || generatedLessons !== null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('0');

  const resetAll = () => {
    setDraftId(null);
    setOutline([]);
    setGeneratedQuestions(null);
    setGeneratedLessons(null);
    setWarnings([]);
    setTopic('');
    setTitle('');
    setDescription('');
    setPriceInput('0');
  };

  const outlineMutation = useMutation({
    mutationFn: () =>
      aiCourseBuilderApi.generateOutline({
        topic: topic.trim(),
        itemType,
        category,
        skillLevel,
        moduleCount: Number(moduleCount) || 5,
      }),
    onSuccess: (r) => {
      setDraftId(r.draftId);
      setOutline(r.outline);
      setTitle(topic.trim());
      queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
      pushToast(`Outline ready: ${r.outline.length} module(s). Review and edit before generating content.`, 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate an outline'), 'error'),
  });

  const saveOutlineMutation = useMutation({
    mutationFn: () => {
      if (!draftId) throw new Error('No draft');
      return aiCourseBuilderApi.updateOutline(draftId, outline);
    },
    onError: (err) => pushToast(errorText(err, 'Could not save outline edits'), 'error'),
  });

  const contentMutation = useMutation({
    mutationFn: () => {
      if (!draftId) throw new Error('No draft');
      return aiCourseBuilderApi.generateContent(draftId);
    },
    onSuccess: (r) => {
      setGeneratedQuestions(r.generatedQuestions);
      setGeneratedLessons(r.generatedLessons);
      setWarnings(r.warnings);
      if (isCourse) {
        const total = Object.keys(r.generatedLessons).length;
        pushToast(`Generated ${total} lesson(s) across ${outline.length} module(s).`, 'success');
      } else {
        const total = Object.values(r.generatedQuestions).reduce((sum, qs) => sum + qs.length, 0);
        pushToast(`Generated ${total} question(s) across ${outline.length} module(s).`, 'success');
      }
      queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate content'), 'error'),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error('No draft');
      const result = await aiCourseBuilderApi.submitDraft({
        draftId,
        title: title.trim(),
        category,
        description: description.trim(),
        suggestedPrice: majorToMinor(Number(priceInput) || 0),
        currency: 'INR',
      });
      if (isAdmin && result.autoApproved) {
        const raw = window.prompt('Selling price in rupees', priceInput);
        if (raw !== null) {
          const rupees = Number(raw);
          if (Number.isFinite(rupees) && rupees >= 0) {
            await catalogSubmissionAdminApi.publish({ submissionId: result.submissionId, price: Math.round(rupees * 100) });
          }
        }
      }
      return result;
    },
    onSuccess: (r) => {
      const countLabel = isCourse ? `${r.totalLessons ?? 0} lesson(s)` : `${r.totalQuestions} question(s)`;
      pushToast(isAdmin ? 'Published to the catalog.' : `Submitted for review: ${countLabel}.`, 'success');
      resetAll();
    },
    onError: (err) => pushToast(errorText(err, 'Could not submit this draft'), 'error'),
  });

  if (access && !access.allowed) return null;

  const updateModule = (index: number, patch: Partial<AiOutlineModule>) => {
    setOutline((cur) => cur.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const removeModule = (index: number) => {
    setOutline((cur) => cur.filter((_, i) => i !== index).map((m, i) => ({ ...m, moduleIndex: i })));
  };
  const moveModule = (index: number, dir: -1 | 1) => {
    setOutline((cur) => {
      const next = [...cur];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((m, i) => ({ ...m, moduleIndex: i }));
    });
  };

  const totalQuestions = generatedQuestions
    ? Object.values(generatedQuestions).reduce((sum, qs) => sum + qs.length, 0)
    : 0;
  const totalLessons = generatedLessons ? Object.keys(generatedLessons).length : 0;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">AI Course Builder</h2>
      <p className="mb-2 text-sm text-ink-faint">
        Describe a topic and let AI draft a module outline and the {isCourse ? 'lesson content' : 'exam questions'}{' '}
        - review and edit everything before {isAdmin ? 'publishing' : 'submitting it for admin review'}.
      </p>
      {usage && usage.limit >= 0 && (
        <p
          className={`mb-4 text-xs font-medium ${
            usage.used >= usage.limit ? 'text-red-500' : 'text-ink-faint'
          }`}
        >
          {Math.max(0, usage.limit - usage.used)} of {usage.limit} AI generations left this month
          {usage.used >= usage.limit && ' - limit reached, resets on the 1st'}
        </p>
      )}

      {!draftId && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Type</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as 'quiz' | 'practiceTest' | 'course')}
                className="input-dark w-full"
              >
                <option value="quiz">Mock Exam (quiz)</option>
                <option value="practiceTest">Practice Test</option>
                <option value="course">Course (written lessons)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Skill level</label>
              <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} className="input-dark w-full">
                <option value="Foundation">Foundation</option>
                <option value="Associate">Associate</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Course topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Server Engineer Fundamentals"
            className="input-dark mt-1 w-full"
          />

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Category</label>
          <CategorySelect value={category} onChange={setCategory} />

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Number of modules</label>
          <input
            type="number"
            min={1}
            max={12}
            value={moduleCount}
            onChange={(e) => setModuleCount(e.target.value)}
            className="input-dark mt-1 w-full sm:w-32"
          />

          <button
            type="button"
            disabled={outlineMutation.isPending || topic.trim().length < 3}
            onClick={() => outlineMutation.mutate()}
            className="mt-4 rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
          >
            {outlineMutation.isPending ? 'Generating outline…' : 'Generate Outline'}
          </button>
        </>
      )}

      {draftId && !hasContent && (
        <div>
          <h3 className="mb-2 font-medium text-ink">Review the outline</h3>
          <div className="space-y-3">
            {outline.map((m, i) => (
              <div key={i} className="rounded-lg border border-surface-border p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={m.title}
                    onChange={(e) => updateModule(i, { title: e.target.value })}
                    className="input-dark flex-1"
                  />
                  <button type="button" onClick={() => moveModule(i, -1)} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveModule(i, 1)} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted">
                    ↓
                  </button>
                  <button type="button" onClick={() => removeModule(i)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-500">
                    Remove
                  </button>
                </div>
                <textarea
                  value={m.description}
                  onChange={(e) => updateModule(i, { description: e.target.value })}
                  rows={2}
                  className="input-dark mt-2 w-full"
                />
                {!isCourse && (
                  <label className="mt-2 block text-xs text-ink-faint">
                    Questions for this module
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={m.questionsPerModule}
                      onChange={(e) => updateModule(i, { questionsPerModule: Number(e.target.value) || 1 })}
                      className="input-dark ml-2 w-24"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saveOutlineMutation.isPending}
              onClick={() => saveOutlineMutation.mutate()}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-50"
            >
              {saveOutlineMutation.isPending ? 'Saving…' : 'Save Outline Edits'}
            </button>
            <button
              type="button"
              disabled={contentMutation.isPending || outline.length === 0}
              onClick={() => contentMutation.mutate()}
              className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {contentMutation.isPending ? 'Generating content…' : 'Generate Content'}
            </button>
            <button type="button" onClick={resetAll} className="text-sm text-ink-faint underline">
              Start over
            </button>
          </div>
        </div>
      )}

      {draftId && hasContent && (
        <div>
          <h3 className="mb-2 font-medium text-ink">
            Review generated {isCourse ? `lessons (${totalLessons} total)` : `questions (${totalQuestions} total)`}
          </h3>
          {warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-surface-border p-3">
            {outline.map((m) =>
              isCourse ? (
                <div key={m.moduleIndex}>
                  <div className="mb-1 text-sm font-medium text-ink">{m.title}</div>
                  <div className="whitespace-pre-wrap rounded border border-surface-border/60 p-2 text-sm text-ink-muted">
                    {(generatedLessons ?? {})[String(m.moduleIndex)] ?? '(no lesson generated for this module)'}
                  </div>
                </div>
              ) : (
                <div key={m.moduleIndex}>
                  <div className="mb-1 text-sm font-medium text-ink">{m.title}</div>
                  {((generatedQuestions ?? {})[String(m.moduleIndex)] ?? []).map((q, i) => (
                    <div key={i} className="mb-2 rounded border border-surface-border/60 p-2 text-sm">
                      <div className="text-ink">{q.questionText}</div>
                      <ul className="mt-1 text-xs text-ink-faint">
                        {q.options.map((o) => (
                          <li key={o.id} className={o.id === q.correctOptionId ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                            {o.id}. {o.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-ink-faint">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-dark mt-1 w-full" />

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-dark mt-1 w-full" />

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">
            {isAdmin ? 'Suggested price (₹)' : 'Suggested price (₹, admin can change this)'}
          </label>
          <input type="number" min={0} value={priceInput} onChange={(e) => setPriceInput(e.target.value)} className="input-dark mt-1 w-full sm:w-40" />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={submitMutation.isPending || title.trim().length < 2}
              onClick={() => submitMutation.mutate()}
              className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {submitMutation.isPending ? 'Working…' : isAdmin ? 'Publish Now' : 'Submit for Review'}
            </button>
            <button type="button" onClick={resetAll} className="text-sm text-ink-faint underline">
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
