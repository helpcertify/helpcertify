import { ExamBrowsePage } from '../components/exam';
import { useMockSeries } from '../hooks/useExamSeries';

// Mock Exams browse page: same responsive certification card grid as the
// Practice Exams page, tuned for timed full-length simulations. One card
// per certification; each opens the per-certification mock detail page.
export function MockExamsPage() {
  const { series, isLoading, isError, refetch } = useMockSeries();

  return (
    <ExamBrowsePage
      kind="mock"
      title="Mock Exams"
      subtitle="Simulate the real exam experience and measure your readiness."
      series={series}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      detailBase="/home/mock-exams/series"
    />
  );
}
