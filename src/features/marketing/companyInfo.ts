// Compile-time DEFAULTS for the public-facing company / legal facts used
// across the marketing and legal pages (About, Contact, Privacy, Terms,
// Refund, Support, Disclaimer), the checkout consent links, and the
// prerendered <head> metadata.
//
// The contact-detail subset (EDITABLE_COMPANY_FIELDS) can be overridden at
// runtime by an admin from Settings -> Company & Contact Details, stored in
// Firestore `appSettings/company` and merged over these defaults by
// companyInfoStore.ts. Everything read through `useCompany()` picks up
// those overrides live in the SPA; the prerendered static HTML shows these
// defaults until the next deploy, which is why the defaults must stay
// accurate too.
//
// Values still marked `CONFIRM` need verifying against IndyaBees'
// registration papers; the rest were provided by the operator (2026-08-29)
// or derived from the codebase (domain, payment processor).

export interface CompanyInfo {
  /** Product / brand name as shown to users. */
  brand: string;
  /** Canonical origin — matches the <link rel="canonical"> in index.html. */
  origin: string;
  /** One-line description of what the platform is (used in <meta> tags too). */
  tagline: string;
  /** Longer description for About / structured data. */
  summary: string;

  /** Operating entity legal name. */
  operatorName: string;
  /** Constitution phrase, e.g. "a registered partnership firm". */
  operatorType: string;
  operatorCountry: string;

  /** Registered place of business (street, area, city, PIN, state, country). */
  registeredAddress: string;
  /** Governing-law venue for the Terms (city / state courts). */
  jurisdiction: string;

  /** Monitored public inbox for support, technical, and legal notices. */
  contactEmail: string;
  /** Public contact phone number (blank = not shown). */
  contactPhone: string;
  /** Inbox where refund / billing / grievance requests are received. */
  grievanceEmail: string;
  /** Named grievance officer for consumer-law compliance (blank = not shown). */
  grievanceOfficer: string;

  /** Outbound transactional sender (from api/auth.ts) — informational only. */
  noReplyEmail: string;
  /** Payment processor (from src/lib/razorpay.ts / api/checkout.ts). */
  paymentProcessor: string;
  /** Last review date for the legal pages. Keep in sync with policyVersions.ts. */
  legalLastUpdated: string;
}

export const COMPANY: CompanyInfo = {
  brand: 'HelpCertify',
  origin: 'https://helpcertify.com',
  tagline:
    'Online certification exam-preparation and practice-test platform operated by IndyaBees.',
  summary:
    'HelpCertify is an online certification exam-preparation and practice-test platform. It offers timed mock exams, large resumable practice question banks, personalized study plans, and ranked performance analytics for IT, security, cloud, and project-management certifications.',

  // HelpCertify is a product and service of IndyaBees, a partnership firm
  // registered in India (operator-provided 2026-08-29).
  operatorName: 'IndyaBees',
  operatorType: 'a registered partnership firm',
  operatorCountry: 'India',

  registeredAddress: '181, Kamraj Nagar 4th Street, Choolaimedu, Chennai 600094, Tamil Nadu, India',
  jurisdiction: 'Chennai, Tamil Nadu',

  contactEmail: 'contact@helpcertify.com',
  contactPhone: '+91 95666 56276',
  // Same inbox as contactEmail for now — a dedicated address can be set
  // from the admin Settings page later without any code change.
  grievanceEmail: 'contact@helpcertify.com',
  grievanceOfficer: 'Rajkumar',

  noReplyEmail: 'no-reply@verify.helpcertify.com',
  paymentProcessor: 'Razorpay',
  legalLastUpdated: '2026-08-29',
};

// The subset an admin may change at runtime from Settings -> Company &
// Contact Details. Brand / origin / tagline / payment processor / policy
// date are code-and-infra facts and stay out of the admin form.
export const EDITABLE_COMPANY_FIELDS = [
  'operatorName',
  'operatorType',
  'operatorCountry',
  'registeredAddress',
  'jurisdiction',
  'contactEmail',
  'contactPhone',
  'grievanceEmail',
  'grievanceOfficer',
] as const satisfies readonly (keyof CompanyInfo)[];

export type EditableCompanyField = (typeof EDITABLE_COMPANY_FIELDS)[number];
