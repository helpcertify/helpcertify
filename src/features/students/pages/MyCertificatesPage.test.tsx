import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyCertificatesPage } from './MyCertificatesPage';
import { certificatesApi, type Certificate } from '@/features/admin/api/resultsApi';

vi.mock('@/features/admin/api/resultsApi', () => ({
  certificatesApi: {
    getMyCertificates: vi.fn(),
    downloadCertificatePdf: vi.fn(),
    printCertificatePdf: vi.fn(),
  },
}));

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function makeCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return {
    id: 'cert-1',
    learnerUid: 'uid1',
    learnerName: 'Priya Sharma',
    sourceType: 'quiz',
    sourceId: 'quiz1',
    sourceTitle: 'CISM Full Mock Exam 1',
    certificationName: 'ISACA',
    attemptId: 'attempt1',
    attemptNumber: 1,
    questionsCompleted: 150,
    totalQuestions: 150,
    scoreCorrect: 112,
    completionPercent: 75,
    passMarkPercent: 60,
    completedAt: new Date('2026-08-20').toISOString(),
    durationSeconds: 7200,
    status: 'issued',
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

describe('MyCertificatesPage', () => {
  beforeEach(() => {
    vi.mocked(certificatesApi.getMyCertificates).mockReset();
    vi.mocked(certificatesApi.downloadCertificatePdf).mockReset().mockResolvedValue(undefined);
  });

  it('shows an empty state when the learner has no certificates yet', async () => {
    vi.mocked(certificatesApi.getMyCertificates).mockResolvedValue({ certificates: [] });
    renderWithProviders(<MyCertificatesPage />);
    expect(await screen.findByText(/no certificates yet/i)).toBeInTheDocument();
  });

  it('lists every certificate with its title, type, attempt number and certificate id', async () => {
    vi.mocked(certificatesApi.getMyCertificates).mockResolvedValue({
      certificates: [makeCertificate({ id: 'cert-1', sourceTitle: 'CISM Full Mock Exam 1' })],
    });
    renderWithProviders(<MyCertificatesPage />);
    expect(await screen.findByText(/certificate of mock exam completion/i)).toBeInTheDocument();
    expect(screen.getByText(/CISM Full Mock Exam 1/)).toBeInTheDocument();
    expect(screen.getByText(/Attempt #1/)).toBeInTheDocument();
    expect(screen.getByText('cert-1')).toBeInTheDocument();
  });

  it('shows "Certificate Revoked" and disables Download/Print for a revoked certificate', async () => {
    vi.mocked(certificatesApi.getMyCertificates).mockResolvedValue({
      certificates: [makeCertificate({ status: 'revoked' })],
    });
    renderWithProviders(<MyCertificatesPage />);
    expect(await screen.findByText(/certificate revoked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^print$/i })).toBeDisabled();
  });

  it('filters to only Mock (quiz) certificates', async () => {
    vi.mocked(certificatesApi.getMyCertificates).mockResolvedValue({
      certificates: [
        makeCertificate({ id: 'cert-quiz', sourceType: 'quiz', sourceTitle: 'CISM Mock Exam' }),
        makeCertificate({ id: 'cert-practice', sourceType: 'practiceTest', sourceTitle: 'CISM Practice Bank', scoreCorrect: null }),
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<MyCertificatesPage />);
    await screen.findByText(/CISM Mock Exam/);
    expect(screen.getByText(/CISM Practice Bank/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mock certificates/i }));
    expect(screen.getByText(/CISM Mock Exam/)).toBeInTheDocument();
    expect(screen.queryByText(/CISM Practice Bank/)).not.toBeInTheDocument();
  });

  it('clicking Download PDF calls the real download API for that certificate', async () => {
    vi.mocked(certificatesApi.getMyCertificates).mockResolvedValue({ certificates: [makeCertificate({ id: 'cert-download-me' })] });
    const user = userEvent.setup();
    renderWithProviders(<MyCertificatesPage />);
    await screen.findByText(/CISM Full Mock Exam 1/);
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(certificatesApi.downloadCertificatePdf).toHaveBeenCalledWith('cert-download-me');
  });
});
