import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BuyNowModal } from './BuyNowModal';

vi.mock('@/features/students/hooks/useMyAvailableCoupons', () => ({
  useMyAvailableCoupons: () => ({ data: [] }),
}));
vi.mock('@/features/students/hooks/useMyCredits', () => ({
  useMyCredits: () => ({ data: undefined }),
}));

function renderModal(onConfirm = vi.fn()) {
  const ui: ReactNode = (
    <BuyNowModal
      title="CISM Full Bank"
      price={199900}
      originalPrice={null}
      currency="INR"
      paying={false}
      summaryItem={{ itemType: 'quiz', questionCount: 1500, accessPeriodDays: 180 }}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  );
  render(<MemoryRouter>{ui}</MemoryRouter>);
  return onConfirm;
}

describe('BuyNowModal', () => {
  it('shows the dynamic order summary', () => {
    renderModal();
    expect(screen.getByText(/you're purchasing/i)).toBeInTheDocument();
    expect(screen.getByText(/1500 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/access period: 180 days/i)).toBeInTheDocument();
  });

  it('keeps Continue to Payment disabled until the consent box is checked', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal();

    const pay = screen.getByRole('button', { name: /continue to payment/i });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).not.toBeChecked();
    expect(pay).toBeDisabled();

    await user.click(boxes[0]);

    expect(pay).toBeEnabled();
    await user.click(pay);
    expect(onConfirm).toHaveBeenCalledWith(
      {
        correctProduct: true,
        previewAcknowledged: true,
        policiesAccepted: true,
        technicalPolicyAcknowledged: true,
      },
      undefined,
      false
    );
  });
});
