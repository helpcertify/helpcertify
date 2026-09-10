import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScoreTrend } from './ScoreTrend';

describe('ScoreTrend', () => {
  it('renders nothing with fewer than two points', () => {
    const { container } = render(<ScoreTrend points={[{ label: '1 Sep', scorePct: 70 }]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('plots one dot per point and labels the last score', () => {
    const { container, getByText } = render(
      <ScoreTrend
        points={[
          { label: '1 Sep', scorePct: 60 },
          { label: '3 Sep', scorePct: 72 },
          { label: '9 Sep', scorePct: 81 },
        ]}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(getByText('81%')).toBeInTheDocument();
  });
});
