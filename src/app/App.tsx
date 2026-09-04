import { AppProviders } from './providers';
import { AppRouter } from './router';
import { ToastStack } from '@/components/common/ToastStack';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SupportLauncher } from '@/components/common/SupportLauncher';

export function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
      <ToastStack />
      <SupportLauncher />
    </AppProviders>
  );
}
