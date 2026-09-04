import type { ReactElement } from 'react';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { RefundPage } from './pages/RefundPage';
import { SupportPage } from './pages/SupportPage';
import { DisclaimerPage } from './pages/DisclaimerPage';
import { BuildYourOwnExamPage } from './pages/BuildYourOwnExamPage';

export interface MarketingRoute {
  path: string;
  element: ReactElement;
  /** <title> for the prerendered HTML of this route. */
  title: string;
  /** <meta name="description"> for the prerendered HTML of this route. */
  description: string;
  /** Relative priority hint for sitemap.xml (0.0 - 1.0). */
  priority: number;
}

// The set of public pages that get real, crawlable HTML emitted at build
// time by scripts/prerender.mjs. Every path here must also be a <Route> in
// src/app/router.tsx so in-app navigation renders the same component.
export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: '/',
    element: <LandingPage />,
    title: 'HelpCertify: Certification Exam Prep',
    description:
      'HelpCertify is an online learning, certification exam-preparation, and assessment platform operated by IndyaBees: timed mock exams, large resumable practice question banks, career-skills courses, and tools to create, sell, or build your own exams.',
    priority: 1.0,
  },
  {
    path: '/about',
    element: <AboutPage />,
    title: 'About HelpCertify',
    description:
      'What HelpCertify is, what you can do on the platform, and the company (IndyaBees) that operates it.',
    priority: 0.7,
  },
  {
    path: '/contact',
    element: <ContactPage />,
    title: 'Contact HelpCertify',
    description:
      'How to reach the HelpCertify team for account, purchase, technical, and privacy questions.',
    priority: 0.5,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
    title: 'Privacy Policy - HelpCertify',
    description:
      'How IndyaBees collects, uses, shares, and retains personal data on HelpCertify, and your choices.',
    priority: 0.4,
  },
  {
    path: '/terms',
    element: <TermsPage />,
    title: 'Terms of Service - HelpCertify',
    description:
      'The agreement between you and IndyaBees for use of HelpCertify: accounts, purchases, acceptable use, and liability.',
    priority: 0.4,
  },
  {
    path: '/refund',
    element: <RefundPage />,
    title: 'Refund & Cancellation Policy - HelpCertify',
    description:
      'When a purchase on HelpCertify can be refunded, how to request a refund, and how long it takes.',
    priority: 0.4,
  },
  {
    path: '/support',
    element: <SupportPage />,
    title: 'Support Policy - HelpCertify',
    description:
      'How HelpCertify investigates and resolves reported technical issues, the resolution timeframe, and when a case is escalated for a remedy.',
    priority: 0.4,
  },
  {
    path: '/disclaimer',
    element: <DisclaimerPage />,
    title: 'Disclaimer - HelpCertify',
    description:
      'HelpCertify is an independent exam-prep service, not affiliated with any certification body; practice material is not official exam content.',
    priority: 0.4,
  },
  {
    path: '/build-your-own-exam',
    element: <BuildYourOwnExamPage />,
    title: 'Bring Your Own Question Bank - HelpCertify',
    description:
      'Upload your own question-and-answer document for a certification HelpCertify does not stock, and use it as a private practice test and mock exam.',
    priority: 0.5,
  },
];
