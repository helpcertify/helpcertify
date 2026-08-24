import { AppProviders } from './providers';
import { AppRouter } from './router';
import { ToastStack } from '@/components/common/ToastStack';

export function App() {
  return (
    <AppProviders>
      <AppRouter />
      <ToastStack />
    </AppProviders>
  );
}
