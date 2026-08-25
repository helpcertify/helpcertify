import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

interface LegalPlaceholderPageProps {
  title: string;
}

// Minimal placeholder so footer links aren't dead — replace with real copy
// before this app is used by anyone outside testing.
export function LegalPlaceholderPage({ title }: LegalPlaceholderPageProps) {
  return (
    <div className="min-h-screen bg-surface px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo size="sm" />
        <h1 className="mb-4 mt-8 text-2xl font-bold text-ink">{title}</h1>
        <p className="text-ink-faint">This page is a placeholder. Real {title.toLowerCase()} copy goes here.</p>
        <Link to="/" className="mt-6 inline-block text-brand-ink underline">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
