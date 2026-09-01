import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CertificateReadyPanel } from './CertificateReadyPanel';
import { certificatesApi, type Certificate } from '@/features/admin/api/resultsApi';

// Not vi.importActual - the real module imports @/lib/firebase, which
// initializes a live Firebase app at import time and throws in this test
// environment (no Firebase config present). A plain mock avoids that
// entirely; only the runtime value (certificatesApi) is needed here, the
// Certificate type is compile-time-only.
vi.mock('@/features/admin/api/resultsApi', () => ({
  certificatesApi: { downloadCertificatePdf: vi.fn(), printCertificatePdf: vi.fn() },
}));

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function makeCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return {
    id: 'cert-abc123',
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

describe('CertificateReadyPanel', () => {
  beforeEach(() => {
    vi.mocked(certificatesApi.downloadCertificatePdf).mockReset().mockResolvedValue(undefined);
    vi.mocked(certificatesApi.printCertificatePdf).mockReset().mockResolvedValue(undefined);
  });

  it('shows "Your completion certificate is ready" with all five actions', () => {
    renderWithRouter(<CertificateReadyPanel certificate={makeCertificate()} dashboardHref="/home" />);
    expect(screen.getByText(/your completion certificate is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view certificate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print certificate/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /verify certificate/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to dashboard/i })).toBeInTheDocument();
  });

  it('opening View Certificate shows the certificate details', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CertificateReadyPanel certificate={makeCertificate()} dashboardHref="/home" />);
    await user.click(screen.getByRole('button', { name: /view certificate/i }));
    expect(screen.getByText('CISM Full Mock Exam 1')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('cert-abc123')).toBeInTheDocument();
  });

  it('Download PDF calls the real downloadCertificatePdf API, not a print dialog', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CertificateReadyPanel certificate={makeCertificate()} dashboardHref="/home" />);
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(certificatesApi.downloadCertificatePdf).toHaveBeenCalledWith('cert-abc123');
    expect(certificatesApi.printCertificatePdf).not.toHaveBeenCalled();
  });

  it('Print Certificate calls printCertificatePdf', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CertificateReadyPanel certificate={makeCertificate()} dashboardHref="/home" />);
    await user.click(screen.getByRole('button', { name: /print certificate/i }));
    expect(certificatesApi.printCertificatePdf).toHaveBeenCalledWith('cert-abc123');
  });

  it('links to the public verify page for this certificate id', () => {
    renderWithRouter(<CertificateReadyPanel certificate={makeCertificate()} dashboardHref="/home" />);
    expect(screen.getByRole('link', { name: /verify certificate/i })).toHaveAttribute('href', '/verify/cert-abc123');
  });
});
