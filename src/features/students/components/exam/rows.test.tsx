import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PracticeSetRow } from './PracticeSetRow';
import { MockExamRow } from './MockExamRow';
import { ExamStatusBadge } from './ExamStatusBadge';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PracticeSetRow', () => {
  it('shows completed accuracy and a Review link', () => {
    wrap(
      <PracticeSetRow
        set={{ testId: 't1', index: 1, totalQuestions: 150, answered: 150, accuracyPct: 82, status: 'completed' }}
        takeHref="/home/practice-tests/t1"
      />,
    );
    expect(screen.getByText('Practice Set 01')).toBeInTheDocument();
    expect(screen.getByText('Completed · Accuracy 82%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/home/practice-tests/t1');
  });

  it('shows in-progress count and a Continue link', () => {
    wrap(
      <PracticeSetRow
        set={{ testId: 't2', index: 3, totalQuestions: 150, answered: 92, accuracyPct: null, status: 'in_progress' }}
        takeHref="/practice-tests/t2/take"
      />,
    );
    expect(screen.getByText('92 / 150 completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toBeInTheDocument();
  });

  it('locked shows the question count and no button', () => {
    wrap(
      <PracticeSetRow
        set={{ testId: 't3', index: 7, totalQuestions: 150, answered: 0, accuracyPct: null, status: 'locked' }}
        takeHref="#"
      />,
    );
    expect(screen.getByText('150 Questions')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view plans/i })).not.toBeInTheDocument();
  });
});

describe('MockExamRow', () => {
  it('completed shows score badge and links to results', () => {
    wrap(
      <MockExamRow
        mock={{ quizId: 'q1', index: 1, totalQuestions: 150, durationMinutes: 240, status: 'completed', scorePct: 78 }}
        takeHref="/quizzes/q1/take"
        resultHref="/home/past-quizzes/q1"
      />,
    );
    expect(screen.getByText('Score 78%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Results' })).toHaveAttribute('href', '/home/past-quizzes/q1');
  });

  it('not started shows questions + duration and Start Mock Exam', () => {
    wrap(
      <MockExamRow
        mock={{ quizId: 'q2', index: 2, totalQuestions: 150, durationMinutes: 240, status: 'not_started', scorePct: null }}
        takeHref="/quizzes/q2/take"
        resultHref="/home/past-quizzes/q2"
      />,
    );
    expect(screen.getByText('150 Questions · 4 Hours')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Mock Exam' })).toHaveAttribute('href', '/quizzes/q2/take');
  });

  it('locked shows the question count and no button', () => {
    wrap(
      <MockExamRow
        mock={{ quizId: 'q3', index: 3, totalQuestions: 150, durationMinutes: 240, status: 'locked', scorePct: null }}
        takeHref="/quizzes/q3/take"
        resultHref="/home/past-quizzes/q3"
      />,
    );
    expect(screen.getByText('150 Questions · 4 Hours')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view plans/i })).not.toBeInTheDocument();
  });
});

describe('ExamStatusBadge', () => {
  it('renders a label per status', () => {
    const { rerender } = render(<ExamStatusBadge status="not_started" />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    rerender(<ExamStatusBadge status="locked" />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });
});
