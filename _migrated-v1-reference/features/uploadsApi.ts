import { upload } from '@vercel/blob/client';
import { auth } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface RegisterUploadResult {
  uploadId: string;
}
interface ParseDocumentResult {
  parsedQuestionsCount: number;
  failedQuestionsCount: number;
}

export const uploadsApi = {
  // 1) upload the raw file straight to Vercel Blob (browser -> Blob, this
  //    server never sees the bytes) via the token-issuing route in
  //    frontend/api/blob-upload.ts, which checks the caller's Firebase role
  //    first. 2) register the resulting URL with the admin-uploads endpoint.
  //    3) trigger parsing immediately.
  async uploadQuestionBank(file: File, courseId: string) {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Not signed in');

    const [blob, checksum] = await Promise.all([
      // access must match the Blob store's own configured mode (private —
      // exam content shouldn't be readable by anyone who guesses/finds the
      // URL) or the upload is rejected outright; 'public' was tried first
      // and fails with "Cannot use public access on a private store" —
      // confirmed against a live upload, not assumed. upload() has no
      // custom-headers option, so the ID token travels as clientPayload
      // instead — verified server-side before a token is issued (see
      // frontend/api/blob-upload.ts).
      upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/blob-upload',
        clientPayload: JSON.stringify({ idToken }),
      }),
      sha256Hex(file),
    ]);

    const registered = await callAction<RegisterUploadResult>('admin-uploads', 'registerUpload', {
      fileUrl: blob.url,
      originalFileName: file.name,
      fileSizeBytes: file.size,
      checksum,
      targetCourseId: courseId,
    });

    const parsed = await callAction<ParseDocumentResult>('admin-uploads', 'parseDocument', {
      uploadId: registered.uploadId,
    });
    return { uploadId: registered.uploadId, ...parsed };
  },
};
