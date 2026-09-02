import { FirebaseError } from 'firebase/app';
import { VercelApiError } from './apiError';

// Firebase/Auth/Functions errors carry a machine code (e.g.
// "auth/email-already-in-use", "functions/internal") but a message meant
// for developers, not end users. This maps the common ones we actually hit
// to something a signing-up user can act on - most importantly, the plain
// "internal" a callable throws when it isn't deployed at all shouldn't
// surface verbatim (see functions-not-deployed handling below).
export function friendlyAuthError(err: unknown, fallback: string): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try logging in instead.';
      case 'auth/invalid-email':
        return 'That email address looks invalid.';
      case 'auth/missing-email':
        return 'Enter your email address first.';
      case 'auth/weak-password':
        return 'Choose a stronger password (at least 8 characters).';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/user-not-found':
        return 'No account found with that email.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/expired-action-code':
      case 'auth/invalid-action-code':
        return 'This reset link has expired or was already used. Request a new one.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
      case 'functions/internal':
      case 'internal':
      case 'functions/unavailable':
        return "We couldn't reach the server. Please try again in a few minutes.";
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : fallback;
}

// Friendlier labels for the API field names that turn up in zod validation
// issues. Anything not listed is de-camelCased ("mockDurationMinutes" ->
// "Mock duration minutes") rather than shown raw.
const FIELD_LABELS: Record<string, string> = {
  shortName: 'Exam code',
  name: 'Name',
  title: 'Title',
  shortDescription: 'Short description',
  description: 'Description',
  slug: 'Slug',
  displayOrder: 'Display order',
  defaultValidityDays: 'Default access validity',
  accessValidityDays: 'Access validity',
  practiceBatchSize: 'Questions per practice batch',
  mockCount: 'Number of mock exams',
  mockBatchSize: 'Questions per mock exam',
  mockDurationMinutes: 'Mock exam duration',
  durationMinutes: 'Duration',
  passMarkPercent: 'Pass mark',
  previewQuestionCount: 'Free preview questions',
  fileUrl: 'Uploaded document',
  price: 'Price',
  originalPrice: 'Original price',
  sellingPrice: 'Selling price',
  code: 'Code',
  couponCode: 'Coupon code',
  email: 'Email',
};

function labelForField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'A field';
}

interface ZodIssueLike {
  path?: unknown[];
  message?: string;
}

// Turns the API's zod issue list into "Short description: String must
// contain at most 300 character(s); Pass mark: Number must be less than or
// equal to 100". Returns null when `details` isn't a usable issue list.
export function expandValidationIssues(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const parts = (details as ZodIssueLike[])
    .filter((issue): issue is ZodIssueLike => !!issue && typeof issue === 'object')
    .slice(0, 3)
    .map((issue) => {
      const key =
        Array.isArray(issue.path) && issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : '';
      const message = issue.message ?? 'invalid value';
      return key ? `${labelForField(key)}: ${message}` : message;
    });
  return parts.length > 0 ? parts.join('; ') : null;
}

// User-facing text for an error thrown by callAction (VercelApiError).
export function friendlyApiError(err: unknown, fallback: string): string {
  if (!(err instanceof VercelApiError)) {
    return err instanceof Error && err.message ? err.message : fallback;
  }
  // Only expand the issue list for the generic "Validation failed" - a
  // handler that threw its own sentence ("No questions could be parsed from
  // this file") already says what's wrong; its details are debug noise.
  if (/^validation failed\b/i.test(err.message)) {
    const issues = expandValidationIssues(err.details);
    if (issues) return `Please fix - ${issues}`;
  }
  switch (err.status) {
    case 401:
      return 'Your session has expired. Sign in again and retry.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'That item no longer exists - it may have been deleted or moved.';
    case 402:
      return err.message || 'This needs to be purchased first.';
    case 409:
      return err.message || 'That conflicts with the current state. Refresh and try again.';
    case 429:
      return 'Too many attempts. Wait a moment and try again.';
    default:
      if (err.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
      return err.message || fallback;
  }
}

// The single entry point for turning any caught error into a toast/message
// string: Firebase auth errors, callAction API errors, or anything else.
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof FirebaseError) return friendlyAuthError(err, fallback);
  if (err instanceof VercelApiError) return friendlyApiError(err, fallback);
  return err instanceof Error && err.message ? err.message : fallback;
}
