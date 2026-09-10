import { Badge, type BadgeTone } from '@/components/ui';
import type { ExamStatus } from './examCta';

const MAP: Record<ExamStatus, { tone: BadgeTone; label: string }> = {
  not_started: { tone: 'neutral', label: 'Not started' },
  in_progress: { tone: 'brand', label: 'In progress' },
  completed: { tone: 'success', label: 'Completed' },
  locked: { tone: 'warning', label: 'Locked' },
};

export function ExamStatusBadge({ status, className }: { status: ExamStatus; className?: string }) {
  const { tone, label } = MAP[status];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
