// The AI course builder pages are mounted twice: under /home/creator/courses
// (students / creators / trainers, in StudentShell) and under
// /admin/creators/courses (admins, in AdminShell - an admin is not a
// 'student' and cannot open the /home/* routes). Every internal link in
// those pages is built from this base so the same components work in both
// places.
export function courseBuilderBase(pathname: string): string {
  return pathname.startsWith('/admin') ? '/admin/creators/courses' : '/home/creator/courses';
}
