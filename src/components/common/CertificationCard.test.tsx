import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CertificationCard } from './CertificationCard';
import { cartApi } from '@/features/students/api/cartApi';
import type { CatalogCertification, CatalogPackage } from '@/features/students/api/certificationCatalogApi';

vi.mock('@/features/students/api/cartApi', () => ({
  cartApi: { addItem: vi.fn() },
}));
vi.mock('@/features/students/hooks/useCheckout', () => ({
  useCheckout: () => ({ checkout: vi.fn(), paying: false, confirmation: null }),
}));
vi.mock('@/features/students/hooks/useMyAvailableCoupons', () => ({
  useMyAvailableCoupons: () => ({ data: [] }),
}));
vi.mock('@/features/students/hooks/useMyCredits', () => ({
  useMyCredits: () => ({ data: undefined }),
}));

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function makePackage(overrides: Partial<CatalogPackage> = {}): CatalogPackage {
  return {
    id: 'pkg-mock',
    certificationId: 'cert1',
    name: 'Mock Exams',
    badgeText: null,
    isRecommended: false,
    description: '5 full mocks',
    includedQuizIds: ['quiz1'],
    includedPracticeTestIds: [],
    price: 199900,
    originalPrice: null,
    currency: 'INR',
    isPublished: true,
    displayOrder: 0,
    state: 'AVAILABLE',
    aggregateTotalQuestions: 150,
    accessValidityDays: 180,
    includedItems: [{ itemType: 'quiz', itemId: 'quiz1', title: 'CISM Mock Exam' }],
    practiceAccessEnabled: false,
    mockAccessEnabled: true,
    accessibleQuestionCount: 0,
    fullMockAttempts: 5,
    questionsPerMock: 150,
    includedFeatures: [],
    ...overrides,
  };
}

function makeCertification(packages: CatalogPackage[]): CatalogCertification {
  return {
    id: 'cert1',
    name: 'CISM Preparation',
    provider: 'ISACA',
    description: 'Certified Information Security Manager',
    iconKey: 'shield',
    isPublished: true,
    displayOrder: 0,
    packages,
  };
}

describe('CertificationCard', () => {
  beforeEach(() => {
    vi.mocked(cartApi.addItem).mockReset();
  });

  it('defaults to the recommended package and shows its price on the CTA', () => {
    const mockPkg = makePackage({ id: 'mock', name: 'Mock Exams', price: 199900, isRecommended: false });
    const completePkg = makePackage({ id: 'complete', name: 'Complete', price: 999900, isRecommended: true, badgeText: 'Best Value' });
    renderWithProviders(<CertificationCard certification={makeCertification([mockPkg, completePkg])} />);

    const completeRadio = screen.getByRole('radio', { name: /complete/i });
    expect(completeRadio).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /buy for.*9,999/i })).toBeInTheDocument();
  });

  it('switching the selected package updates the purchase button without touching a second card', async () => {
    const user = userEvent.setup();
    const mockPkg = makePackage({ id: 'mock', name: 'Mock Exams', price: 199900, isRecommended: true });
    const completePkg = makePackage({ id: 'complete', name: 'Complete', price: 999900, isRecommended: false });
    const certA = makeCertification([mockPkg, completePkg]);
    const certB = makeCertification([makePackage({ id: 'other-mock', name: 'Mock Exams', price: 149900, isRecommended: true })]);
    Object.assign(certB, { id: 'cert2', name: 'CISA Preparation' });

    renderWithProviders(
      <>
        <CertificationCard certification={certA} />
        <CertificationCard certification={certB} />
      </>
    );

    const cismSection = screen.getByText('CISM Preparation').closest('div')!.parentElement!.parentElement!;
    await user.click(within(cismSection).getByRole('radio', { name: /complete/i }));

    expect(within(cismSection).getByRole('button', { name: /buy for.*9,999/i })).toBeInTheDocument();
    // CISA's own card still shows its own package's price, untouched by CISM's selection.
    expect(screen.getByRole('button', { name: /buy for.*1,499/i })).toBeInTheDocument();
  });

  it('calls cartApi.addItem with itemType "package" when Add to Cart is clicked', async () => {
    vi.mocked(cartApi.addItem).mockResolvedValue({
      items: [],
      couponCode: null,
      currency: 'INR',
      subtotal: 0,
      discount: 0,
      total: 0,
    });
    const user = userEvent.setup();
    const pkg = makePackage({ id: 'mock', isRecommended: true });
    renderWithProviders(<CertificationCard certification={makeCertification([pkg])} />);

    await user.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(cartApi.addItem).toHaveBeenCalledWith('package', 'mock');
  });

  it('shows "In Cart" when the package is already in the cart', () => {
    const pkg = makePackage({ id: 'mock', isRecommended: true, state: 'IN_CART' });
    renderWithProviders(<CertificationCard certification={makeCertification([pkg])} />);
    expect(screen.getByRole('link', { name: /in cart/i })).toBeInTheDocument();
  });

  it('shows "Continue Learning" when the package is already active/owned', () => {
    const pkg = makePackage({ id: 'mock', isRecommended: true, state: 'ACTIVE' });
    renderWithProviders(<CertificationCard certification={makeCertification([pkg])} />);
    expect(screen.getByRole('link', { name: /continue learning/i })).toBeInTheDocument();
  });

  it('shows a disabled Coming Soon button for a certification with no published packages', () => {
    renderWithProviders(<CertificationCard certification={makeCertification([])} />);
    expect(screen.getByRole('button', { name: /coming soon/i })).toBeDisabled();
  });

  it('package pills are real radio buttons, keyboard-operable and not color-only for selected state', async () => {
    const user = userEvent.setup();
    const mockPkg = makePackage({ id: 'mock', name: 'Mock Exams', isRecommended: true });
    const completePkg = makePackage({ id: 'complete', name: 'Complete', isRecommended: false });
    renderWithProviders(<CertificationCard certification={makeCertification([mockPkg, completePkg])} />);

    const completeRadio = screen.getByRole('radio', { name: /complete/i });
    completeRadio.focus();
    await user.keyboard('{Enter}');
    expect(completeRadio).toHaveAttribute('aria-checked', 'true');
    // A visible checkmark glyph, not just a background color swap.
    expect(within(completeRadio).getByText('✓')).toBeInTheDocument();
  });
});
