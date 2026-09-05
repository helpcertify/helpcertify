// Pure decision logic for whether a course lesson is fully readable - see
// api/content-admin.ts's getCourseForReading/markLessonComplete, which
// duplicate this exact reasoning inline for their own Firestore-backed
// gating check (no cross-file imports across api/*.ts, per this repo's
// existing convention; this module exists purely so the logic itself has
// unit test coverage, same pattern as featureAccess.ts).

export function isLessonUnlocked(lessonOrder: number, owns: boolean, previewLessonCount: number): boolean {
  return owns || lessonOrder < previewLessonCount;
}
