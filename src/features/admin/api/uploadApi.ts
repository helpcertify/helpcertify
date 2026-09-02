import { upload } from '@vercel/blob/client';
import { auth } from '@/lib/firebase';

// Keep in step with MAX_UPLOAD_BYTES in api/blob-upload.ts.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;

// Uploads straight to Vercel Blob (browser -> Blob, our server never sees the
// bytes) via the token-issuing route in api/blob-upload.ts, which checks the
// caller's admin role first. access must be 'private' - the store
// (helpcertify-uploads) is configured private-only; 'public' fails outright.
export async function uploadContentFile(file: File): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Not signed in');

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `This file is ${mb} MB. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB - remove embedded images or split the document.`,
    );
  }
  if (!/\.docx$/i.test(file.name)) {
    throw new Error('Upload a .docx file. Export from Word or Google Docs as .docx first.');
  }

  // The Blob client upload can stall indefinitely on a flaky connection or a
  // multipart part that never completes - cap it so the admin gets an error
  // to act on instead of a button stuck on "Uploading...".
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Upload timed out. Check your connection and try again.')), UPLOAD_TIMEOUT_MS),
  );

  const blob = await Promise.race([
    upload(file.name, file, {
      access: 'private',
      handleUploadUrl: '/api/blob-upload',
      clientPayload: JSON.stringify({ idToken }),
    }),
    timeout,
  ]);
  return blob.url;
}
