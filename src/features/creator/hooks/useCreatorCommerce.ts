import { useQuery } from '@tanstack/react-query';
import { creatorCommerceApi } from '../api/creatorCommerceApi';
import type { CreatorEntitlement } from '@/types/models';

/** The Creator entitlements the signed-in user currently holds, plus the
 *  legacy ai_course_builder admin-override flag. */
export function useMyCreatorEntitlements() {
  const q = useQuery({ queryKey: ['creator', 'myEntitlements'], queryFn: creatorCommerceApi.getMyEntitlements, staleTime: 60_000 });
  const held = new Set<CreatorEntitlement>((q.data?.entitlements ?? []).map((e) => e.entitlement));
  const flag = q.data?.aiCourseBuilderFlag ?? false;
  const has = (e: CreatorEntitlement): boolean => {
    if (held.has(e)) return true;
    // The old free flag still unlocks the AI paths for existing users.
    if (flag && (e === 'course_creator_ai' || e === 'exam_creator_ai')) return true;
    return false;
  };
  return {
    ...q,
    held,
    aiCourseBuilderFlag: flag,
    commerceEnabled: q.data?.commerceEnabled ?? false,
    hasCourseManual: has('course_creator_manual'),
    hasCourseAi: has('course_creator_ai'),
    hasExamManual: has('exam_creator_manual'),
    hasExamAi: has('exam_creator_ai'),
    has,
  };
}

/** The signed-in user's HelpCertify AI Credits balance + the op cost table. */
export function useMyCreatorCredits() {
  return useQuery({ queryKey: ['creator', 'myCredits'], queryFn: creatorCommerceApi.getMyCredits, staleTime: 30_000 });
}
