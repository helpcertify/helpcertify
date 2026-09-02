import { auth } from './firebase';

// Every server-trusted operation (grading, atomic counters, role changes,
// answer-key access) now runs as a Vercel serverless function under
// frontend/api/ instead of a Firebase Cloud Function callable - Cloud
// Functions require the Blaze plan just to deploy, while a Vercel function
// using a Firebase service account can perform the exact same Admin SDK
// operations without it (see frontend/api/enrollment.ts's header comment
// for the full story). Each api/*.ts file groups several related actions
// behind one POST endpoint - this helper is the client-side half: it
// attaches the caller's ID token and dispatches by `action`, mirroring how
// httpsCallable(functions, 'actionName') used to work.
import { VercelApiError } from './apiError';

export { VercelApiError };

export async function callAction<T = unknown>(
  endpoint: string,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}) as { error?: string; details?: unknown });
  if (!res.ok) {
    throw new VercelApiError(body.error || `Request failed (${res.status})`, res.status, body.details);
  }
  return body as T;
}
