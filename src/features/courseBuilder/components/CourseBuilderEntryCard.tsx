import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiCourseBuilderApi } from '@/features/catalogSubmissions/api/aiCourseBuilderApi';
import { courseBuilderBase } from '../basePath';

// Entry point to the dedicated AI course creation flow (blueprint ->
// lessons -> visual lessons), shown on the Creator / Trainer workspaces
// and the admin Creators page next to the older inline AiCourseBuilderFlow
// (which stays for quizzes and practice tests). Renders nothing without
// ai_course_builder access, same as AiCourseBuilderFlow.
export function CourseBuilderEntryCard() {
  const { data: access } = useQuery({ queryKey: ['aiCourseBuilder', 'myAccess'], queryFn: aiCourseBuilderApi.checkMyAccess });
  const base = courseBuilderBase(useLocation().pathname);
  if (access && !access.allowed) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">Create a course with AI</h2>
      <p className="mb-4 text-sm text-ink-faint">
        Describe a course and let AI draft its structure. Review and edit lessons, then generate lesson
        content and visual lessons one at a time, on demand.
      </p>
      <Link
        to={base}
        className="inline-block rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB]"
      >
        Open course builder
      </Link>
    </div>
  );
}
