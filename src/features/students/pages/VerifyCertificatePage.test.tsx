import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VerifyCertificatePage } from './VerifyCertificatePage';
import { certificatesApi } from '@/features/admin/api/resultsApi';

vi.mock('@/features/admin/api/resultsApi', () => ({
  certificatesApi: { verifyCertificate: vi.fn() },
}));

function renderAtCertificate(certificateId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/verify/${certificateId}`]}>
        <Routes>
          <Route path="/verify/:certificateId" element={<VerifyCertificatePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VerifyCertificatePage', () => {
  it('shows "Valid Certificate" and the learner/completion details for an issued certificate', async () => {
    vi.mocked(certificatesApi.verifyCertificate).mockResolvedValue({
      certificate: {
        id: 'cert-1',
        learnerName: 'Priya Sharma',
        sourceType: 'quiz',
        sourceTitle: 'CISM Full Mock Exam 1',
        certificationName: 'ISACA',
        attemptNumber: 1,
        completionPercent: 75,
        status: 'issued',
        completedAt: new Date('2026-08-20').toISOString(),
        revokedAt: null,
      },
    });
    renderAtCertificate('cert-1');
    expect(await screen.findByText(/valid certificate/i)).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('cert-1')).toBeInTheDocument();
  });

  it('shows "Certificate Revoked" for a revoked certificate', async () => {
    vi.mocked(certificatesApi.verifyCertificate).mockResolvedValue({
      certificate: {
        id: 'cert-2',
        learnerName: 'Priya Sharma',
        sourceType: 'practiceTest',
        sourceTitle: 'CISM Practice Bank',
        certificationName: 'ISACA',
        attemptNumber: 1,
        completionPercent: 100,
        status: 'revoked',
        completedAt: new Date('2026-08-20').toISOString(),
        revokedAt: new Date('2026-08-25').toISOString(),
      },
    });
    renderAtCertificate('cert-2');
    expect(await screen.findByText(/certificate revoked/i)).toBeInTheDocument();
    expect(screen.queryByText(/valid certificate/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for an unknown certificate id', async () => {
    vi.mocked(certificatesApi.verifyCertificate).mockRejectedValue(new Error('Certificate not found'));
    renderAtCertificate('does-not-exist');
    expect(await screen.findByText(/certificate not found/i)).toBeInTheDocument();
  });
});
