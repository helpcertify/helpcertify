import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from '@/lib/queryClient';
import { initAuthListener } from '@/features/auth/initAuth';
import { loadCompanyInfoOverrides } from '@/features/marketing/loadCompanyInfo';
import { loadCustomExamBuilderOverrides } from '@/features/marketing/loadCustomExamBuilderInfo';
import { loadAppearanceSettings } from '@/features/appearance/loadAppearance';

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    void loadCompanyInfoOverrides();
    void loadCustomExamBuilderOverrides();
    void loadAppearanceSettings();
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
