import { upload } from '@vercel/blob/client';
import { auth } from '@/lib/firebase';

// Uploads straight to Vercel Blob (browser -> Blob, our server never sees the
// bytes) via the token-issuing route in api/blob-upload.ts, which checks the
// caller's admin role first. access must be 'private' - the store
// (helpcertify-uploads) is configured private-only; 'public' fails outright.
export async function uploadContentFile(file: File): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Not signed in');

  const blob = await upload(file.name, file, {
    access: 'private',
    handleUploadUrl: '/api/blob-upload',
    clientPayload: JSON.stringify({ idToken }),
  });
  return blob.url;
}
