import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';

// Direct Firestore write, not a Vercel/Cloud Function — firestore.rules
// already allow this without server-trusted logic (no cross-document
// invariant to check beyond enrolledCount == 0, which the rule itself
// enforces): `allow create: if isStaff() && (isAdmin() ||
// request.resource.data.instructorId == request.auth.uid) &&
// request.resource.data.enrolledCount == 0`. First step in the
// course -> upload questions -> create exam -> enroll -> take exam pipeline;
// nothing downstream has anywhere to attach to without a course to pick.
const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title is too short').max(200),
  description: z.string().trim().min(10, 'Add a longer description').max(5000),
  category: z.string().trim().min(2, 'Category is required'),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  isPublished: z.boolean(),
  isFree: z.boolean(),
  price: z.coerce.number().min(0).optional(),
});
type CreateCourseForm = z.infer<typeof createCourseSchema>;

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 7) // avoids a slug-uniqueness query for a low-traffic admin form
  );
}

export function CreateCoursePage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateCourseForm>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: { level: 'beginner', isPublished: true, isFree: true, price: 0 },
  });
  const isFree = watch('isFree');

  const mutation = useMutation({
    mutationFn: async (values: CreateCourseForm) => {
      if (!profile) throw new Error('Not signed in');
      const now = serverTimestamp();
      const ref = await addDoc(collection(db, 'courses'), {
        title: values.title,
        slug: slugify(values.title),
        description: values.description,
        instructorId: profile._id,
        instructorName: profile.name,
        category: values.category,
        tags: [],
        level: values.level,
        thumbnailUrl: null,
        price: values.isFree ? 0 : (values.price ?? 0),
        isFree: values.isFree,
        isPublished: values.isPublished,
        publishedAt: values.isPublished ? now : null,
        enrolledCount: 0,
        averageRating: 0,
        ratingCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      return ref.id;
    },
    onSuccess: () => {
      pushToast('Course created', 'success');
      navigate('/admin/uploads');
    },
    onError: (err) => pushToast((err as Error).message || 'Could not create course', 'error'),
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Create a course</h1>
      <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            placeholder="CISM Certification Prep"
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            {...register('title')}
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            {...register('description')}
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium">
              Category
            </label>
            <input
              id="category"
              placeholder="Security"
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('category')}
            />
            {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>}
          </div>
          <div>
            <label htmlFor="level" className="mb-1 block text-sm font-medium">
              Level
            </label>
            <select
              id="level"
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('level')}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input id="isFree" type="checkbox" {...register('isFree')} />
          <label htmlFor="isFree" className="text-sm font-medium">
            Free course
          </label>
        </div>
        {!isFree && (
          <div>
            <label htmlFor="price" className="mb-1 block text-sm font-medium">
              Price (USD)
            </label>
            <input
              id="price"
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              {...register('price')}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input id="isPublished" type="checkbox" {...register('isPublished')} />
          <label htmlFor="isPublished" className="text-sm font-medium">
            Publish immediately (visible in the catalog and open for enrollment)
          </label>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded bg-brand-500 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {mutation.isPending ? 'Creating…' : 'Create course'}
        </button>
      </form>
    </div>
  );
}
