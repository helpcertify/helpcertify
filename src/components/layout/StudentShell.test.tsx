import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExamCountdown } from '@/features/students/hooks/useExamCountdowns';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {}, app: {} }));
vi.mock('@/features/auth/api/authApi', () => ({ authApi: { logout: vi.fn() } }));
vi.mock('@/features/students/api/cartApi', () => ({
  cartApi: { getCart: () => Promise.resolve({ items: [] }) },
}));

const countdowns = vi.fn<() => ExamCountdown[]>();
vi.mock('@/features/students/hooks/useExamCountdowns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/students/hooks/useExamCountdowns')>();
  return { ...actual, useExamCountdowns: () => ({ data: countdowns() }) };
});

import { StudentShell } from './StudentShell';

const exam = (over: Partial<ExamCountdown>): ExamCountdown => ({
  testId: 't1',
  examName: 'CISA',
  provider: 'ISACA',
  examDate: new Date('2026-09-30'),
  daysToExam: 33,
  updatedAt: new Date('2026-08-01'),
  ...over,
});

function renderShell(ui: ReactNode = <div>page</div>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<StudentShell />}>
            <Route path="/home" element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StudentShell "Your Exams"', () => {
  beforeEach(() => countdowns.mockReset());

  it('shows a single exam card even when several exams are scheduled', () => {
    countdowns.mockReturnValue([
      exam({ testId: 'a', examName: 'CISM', daysToExam: 19, updatedAt: new Date('2026-08-10') }),
      exam({ testId: 'b', examName: 'CISA', daysToExam: 33, updatedAt: new Date('2026-08-27') }),
    ]);
    renderShell();
    // Desktop sidebar is the only "Your Exams" block in the DOM until the
    // mobile menu is opened - exactly one countdown, and it's the newer goal.
    expect(screen.getAllByText(/Days to Go/i)).toHaveLength(1);
    expect(screen.getByText('CISA')).toBeInTheDocument();
    expect(screen.queryByText('CISM')).not.toBeInTheDocument();
  });

  it('renders no "Your Exams" section when nothing is scheduled', () => {
    countdowns.mockReturnValue([]);
    renderShell();
    expect(screen.queryByText('Your Exams')).not.toBeInTheDocument();
  });
});
