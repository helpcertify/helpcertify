export type Role = 'student' | 'admin';

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  // Manually logged minutes (preset or custom, see SettingsPage), added on
  // top of the auto-computed quiz-attempt duration total shown on Home.
  manualStudyMinutes: number;
}
