import { AppProviders } from './providers';
import { AppRouter } from './router';
import { ToastStack } from '@/components/common/ToastStack';
import { GlobalDialog } from '@/components/common/GlobalDialog';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
      <ToastStack />
      <GlobalDialog />
    </AppProviders>
  );
}
