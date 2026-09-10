import type { ExamStatus } from './examCta';

export type ExamBrowseTab = 'all' | 'available' | 'in_progress' | 'completed';
export type ExamLayout = 'grid' | 'list';

// Maps a certification card's rolled-up status to the browse tab it belongs
// to. Locked cards only ever show under "All".
export function matchesTab(tab: ExamBrowseTab, status: ExamStatus): boolean {
  if (tab === 'all') return true;
  if (tab === 'available') return status === 'not_started';
  if (tab === 'in_progress') return status === 'in_progress';
  return status === 'completed';
}
