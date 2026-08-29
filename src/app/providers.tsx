import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from '@/lib/queryClient';
import { initAuthListener } from '@/features/auth/initAuth';
import { loadCompanyInfoOverrides } from '@/features/marketing/loadCompanyInfo';

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    void loadCompanyInfoOverrides();
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
