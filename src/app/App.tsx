import { AppProviders } from './providers';
import { AppRouter } from './router';
import { ToastStack } from '@/components/common/ToastStack';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
      <ToastStack />
    </AppProviders>
  );
}
