import { FirebaseError } from 'firebase/app';

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
