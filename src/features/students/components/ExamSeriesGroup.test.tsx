import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ExamSeriesGroup, type SeriesGroupItem } from './ExamSeriesGroup';

const items: SeriesGroupItem[] = [
  { id: 'b2', batchIndex: 2, label: 'CISM Practice Exam 02' },
  { id: 'b1', batchIndex: 1, label: 'CISM Practice Exam 01' },
  { id: 'b10', batchIndex: 10, label: 'CISM Practice Exam 10' },
];

const renderGroup = (props: Partial<Parameters<typeof ExamSeriesGroup>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ExamSeriesGroup
        certName="Certified Information Security Manager (CISM)"
        kind="practice"
        items={items}
        totalQuestions={1645}
        owned
        entitlementLocked={false}
        {...props}
      />
    </MemoryRouter>,
  );

describe('ExamSeriesGroup', () => {
  it('shows the certification header and a summary line', () => {
    renderGroup();
    expect(
      screen.getByText('Certified Information Security Manager (CISM) Practice Exams'),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 exams · 1,645 questions/)).toBeInTheDocument();
  });

  it('expands to the batch list in batchIndex order on click', async () => {
    renderGroup();
    expect(screen.queryByText('CISM Practice Exam 01')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /CISM.*Practice Exams/ }));
    const labels = screen.getAllByText(/CISM Practice Exam \d\d/).map((el) => el.textContent);
    expect(labels).toEqual(['CISM Practice Exam 01', 'CISM Practice Exam 02', 'CISM Practice Exam 10']);
  });

  it('practice: shows a feedback-mode toggle once expanded', async () => {
    renderGroup();
    await userEvent.click(screen.getByRole('button', { name: /CISM.*Practice Exams/ }));
    expect(screen.getByText('How would you like to practice?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /learn as you go/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review at end/i })).toBeInTheDocument();
  });

  it('mock: no feedback-mode toggle', async () => {
    renderGroup({ kind: 'mock' });
    await userEvent.click(screen.getByRole('button', { name: /CISM.*Mock Exams/ }));
    expect(screen.queryByText('How would you like to practice?')).not.toBeInTheDocument();
  });

  it('locked state shows only an unlock link', () => {
    renderGroup({ owned: false, entitlementLocked: true });
    expect(screen.getByRole('link', { name: /unlock with a package/i })).toHaveAttribute('href', '/home');
    expect(screen.queryByText('CISM Practice Exam 01')).not.toBeInTheDocument();
  });

  it('renders a study-goal button only when onSetGoal is given', () => {
    const { rerender } = renderGroup();
    expect(screen.queryByRole('button', { name: /set my study goal/i })).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ExamSeriesGroup
          certName="CISM"
          kind="practice"
          items={items}
          totalQuestions={1645}
          owned
          entitlementLocked={false}
          onSetGoal={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /set my study goal/i })).toBeInTheDocument();
  });
});
