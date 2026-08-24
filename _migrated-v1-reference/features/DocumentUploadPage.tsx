import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { uploadsApi } from '../api/uploadsApi';

interface CourseOption {
  id: string;
  title: string;
}

// Instructor/admin flow for importing a question bank: pick one of your own
// courses, pick a .docx, upload — see uploadsApi for the Blob-upload ->
// registerUpload -> parseDocument chain this drives.
export function DocumentUploadPage() {
  const uid = useAuthStore((s) => s.profile?._id);
  const [courseId, setCourseId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['my-courses-for-upload', uid],
    queryFn: async (): Promise<CourseOption[]> => {
      const snap = await getDocs(query(collection(db, 'courses'), where('instructorId', '==', uid)));
      return snap.docs.map((d) => ({ id: d.id, title: d.data().title as string }));
    },
    enabled: Boolean(uid),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !courseId) throw new Error('Choose a course and a .docx file first');
      return uploadsApi.uploadQuestionBank(file, courseId);
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Import question bank</h1>
      <div className="max-w-md space-y-4">
        <div>
          <label htmlFor="course" className="mb-1 block text-sm font-medium">
            Course
          </label>
          <select
            id="course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">Select a course…</option>
            {coursesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="file" className="mb-1 block text-sm font-medium">
            Word document (.docx)
          </label>
          <input
            id="file"
            type="file"
            accept=".docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => uploadMutation.mutate()}
          disabled={uploadMutation.isPending || !file || !courseId}
          className="rounded bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {uploadMutation.isPending ? 'Uploading & parsing…' : 'Upload'}
        </button>

        {uploadMutation.isSuccess && (
          <p className="rounded border border-brand-500 bg-brand-50 p-3 text-sm text-brand-600">
            Parsed {uploadMutation.data.parsedQuestionsCount} questions
            {uploadMutation.data.failedQuestionsCount > 0 &&
              `, ${uploadMutation.data.failedQuestionsCount} flagged for review`}
            .
          </p>
        )}
        {uploadMutation.isError && (
          <p className="text-sm text-red-600">{(uploadMutation.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
