// The error callAction throws for a non-2xx response. Kept in its own
// module (no firebase import) so error-message helpers and tests can use it
// without pulling in the Firebase SDK initialisation that lib/vercelApi.ts
// triggers.
export class VercelApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}
