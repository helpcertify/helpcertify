export type Role = 'student' | 'admin';

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
}
