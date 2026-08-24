export type Role = 'student' | 'admin';

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  department: string | null;
  yearOfAdmission: number | null;
  currentAcademicYear: string | null;
}
