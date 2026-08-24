import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { callAction } from '@/lib/vercelApi';

interface CourseOption {
  id: string;
  title: string;
}
interface QuestionOption {
  id: string;
  questionText: string;
  type: string;
  defaultMarks: number;
}

const createExamSchema = z.object({
  courseId: z.string().min(1, 'Choose a course'),
  title: z.string().trim().min(3, 'Title is too short').max(200),
  type: z.enum(['quiz', 'midterm', 'final', 'practice', 'certification']),
  durationMinutes: z.coerce.number().int().min(1),
  passingPercent: z.coerce.number().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1),
  isCertificationExam: z.boolean(),
  isPublished: z.boolean(),
});
type CreateExamForm = z.infer<typeof createExamSchema>;

// Turns questions already in the bank (created individually, or in bulk via
// DocumentUploadPage's .docx import) into something students can actually
// take — see frontend/api/exam-admin.ts's createExam action. Without this
// page, an uploaded question bank has nowhere to go.
export function CreateExamPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateExamForm>({
    resolver: zodResolver(createExamSchema),
    defaultValues: {
      type: 'certification',
      durationMinutes: 90,
      passingPercent: 70,
      maxAttempts: 2,
      isCertificationExam: true,
      isPublished: true,
    },
  });
  const courseId = watch('courseId');

  const coursesQuery = useQuery({
    queryKey: ['my-courses-for-exam', profile?._id],
    queryFn: async (): Promise<CourseOption[]> => {
      const snap = await getDocs(query(collection(db, 'courses'), where('instructorId', '==', profile?._id)));
      return snap.docs.map((d) => ({ id: d.id, title: d.data().title as string }));
    },
    enabled: Boolean(profile?._id),
  });

  // Direct Firestore read (not the staff searchQuestions action) — same
  // firestore.rules path questions/{id} reads already use elsewhere
  // (isActive == true is readable by any signed-in user); picking questions
  // for an exam only needs the public doc, never the answer key.
  const questionsQuery = useQuery({
    queryKey: ['questions-for-exam', courseId],
    queryFn: async (): Promise<QuestionOption[]> => {
      const snap = await getDocs(
        query(collection(db, 'questions'), where('courseId', '==', courseId), where('isActive', '==', true))
      );
      return snap.docs.map((d) => ({
        id: d.id,
        questionText: d.data().questionText as string,
        type: d.data().type as string,
        defaultMarks: (d.data().defaultMarks as number) ?? 1,
      }));
    },
    enabled: Boolean(courseId),
  });

  const selectedQuestions = useMemo(
    () => (questionsQuery.data ?? []).filter((q) => selectedIds.has(q.id)),
    [questionsQuery.data, selectedIds]
  );
  const totalMarks = selectedQuestions.reduce((sum, q) => sum + q.defaultMarks, 0);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: async (values: CreateExamForm) => {
      if (selectedQuestions.length === 0) throw new Error('Select at least one question');
      const marks = totalMarks;
      return callAction('exam-admin', 'createExam', {
        title: values.title,
        courseId: values.courseId,
        type: values.type,
        questions: selectedQuestions.map((q, i) => ({ questionId: q.id, order: i, marks: q.defaultMarks })),
        totalMarks: marks,
        passingMarks: Math.round((values.passingPercent / 100) * marks),
        durationMinutes: values.durationMinutes,
        maxAttempts: values.maxAttempts,
        isCertificationExam: values.isCertificationExam,
        isPublished: values.isPublished,
      });
    },
    onSuccess: () => {
      pushToast('Exam created', 'success');
      navigate('/courses');
    },
    onError: (err) => pushToast((err as Error).message || 'Could not create exam', 'error'),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Create an exam</h1>
      <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <div>
          <label htmlFor="courseId" className="mb-1 block text-sm font-medium">
            Course
          </label>
          <select
            id="courseId"
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            {...register('courseId')}
          >
            <option value="">Select a course…</option>
            {coursesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {errors.courseId && <p className="mt-1 text-sm text-red-600">{errors.courseId.message}</p>}
        </div>

        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Exam title
          </label>
          <input
            id="title"
            placeholder="CISM Certification Exam"
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            {...register('title')}
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="durationMinutes" className="mb-1 block text-sm font-medium">
              Duration (min)
            </label>
            <input
              id="durationMinutes"
              type="number"
              min={1}
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('durationMinutes')}
            />
          </div>
          <div>
            <label htmlFor="passingPercent" className="mb-1 block text-sm font-medium">
              Passing %
            </label>
            <input
              id="passingPercent"
              type="number"
              min={0}
              max={100}
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('passingPercent')}
            />
          </div>
          <div>
            <label htmlFor="maxAttempts" className="mb-1 block text-sm font-medium">
              Max attempts
            </label>
            <input
              id="maxAttempts"
              type="number"
              min={1}
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('maxAttempts')}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register('isCertificationExam')} /> Certification exam (issues a certificate on pass)
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register('isPublished')} /> Publish immediately
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">
              Questions {courseId ? `(${selectedQuestions.length} selected, ${totalMarks} marks)` : ''}
            </span>
          </div>
          {!courseId && <p className="text-sm text-neutral-500">Choose a course to see its question bank.</p>}
          {courseId && questionsQuery.isLoading && <p className="text-sm text-neutral-500">Loading questions…</p>}
          {courseId && questionsQuery.data?.length === 0 && (
            <p className="text-sm text-neutral-500">
              No questions yet for this course — import some first from Admin → Import question bank.
            </p>
          )}
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded border border-neutral-200 p-2 dark:border-neutral-800">
            {questionsQuery.data?.map((q) => (
              <li key={q.id}>
                <label className="flex items-start gap-2 rounded p-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggle(q.id)}
                  />
                  <span>
                    {q.questionText}{' '}
                    <span className="text-xs text-neutral-400">
                      ({q.type}, {q.defaultMarks} mark{q.defaultMarks === 1 ? '' : 's'})
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded bg-brand-500 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {mutation.isPending ? 'Creating…' : 'Create exam'}
        </button>
      </form>
    </div>
  );
}
