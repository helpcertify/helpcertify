export interface LoginPayload {
  email: string;
  password: string;
}

// No `role` field — every self-registered account is a student (api/auth.ts
// fixes this server-side). Admin accounts are created by an existing admin.
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}
