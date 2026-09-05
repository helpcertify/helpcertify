import { callAction } from '@/lib/vercelApi';

// The one unauthenticated catalog read - see api/cart.ts's getPublicCatalog.
// This module imports @/lib/vercelApi (which loads Firebase at module
// scope), so it must only ever be reached through a dynamic import() from
// the landing page - never a static import into src/features/marketing or
// the prerender entry. The public /search page (not prerendered) may
// import it normally.

export interface PublicCourse {
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  totalLessons: number;
  coverImageUrl: string | null;
  createdAtMs: number;
}

export interface PublicCertification {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  shortDescription: string;
  packageCount: number;
  fromPriceMinor: number;
  currency: 'INR' | 'USD';
}

export interface PublicPracticeTest {
  id: string;
  title: string;
  category: string;
  examName: string | null;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  totalQuestions: number;
}

export interface PublicQuiz {
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  totalQuestions: number;
  durationMinutes: number | null;
}

export interface PublicCatalog {
  certifications: PublicCertification[];
  courses: PublicCourse[];
  practiceTests: PublicPracticeTest[];
  quizzes: PublicQuiz[];
}

export const getPublicCatalog = () => callAction<PublicCatalog>('cart', 'getPublicCatalog');
