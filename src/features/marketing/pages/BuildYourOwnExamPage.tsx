import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { useCustomExamBuilderInfo } from '../customExamBuilderStore';
import { formatMoney } from '@/utils/currency';

// Marketing page for the Custom Exam Builder feature ("Bring Your Own
// Question Bank"). Price/offer shown below come from the live,
// admin-editable appSettings/customExamBuilder doc (via
// useCustomExamBuilderInfo, merged in after hydration - see
// loadCustomExamBuilderInfo.ts) so an admin price change is reflected here
// without a deploy; the compile-time default (₹499, no offer) renders
// immediately during prerender and the first paint, same pattern as
// useCompany()/COMPANY. The CTA points at /register, not the student-only
// /home/custom-exams route, since a new visitor needs an account first.
export function BuildYourOwnExamPage() {
  const { priceMinor, originalPriceMinor, currency } = useCustomExamBuilderInfo();
  const hasOffer = !!originalPriceMinor && originalPriceMinor > priceMinor;
  return (
    <MarketingPage
      title="Bring Your Own Question Bank"
      intro="Don't see your certification on HelpCertify? Upload your own question bank and use HelpCertify's practice and mock-exam engine on it, privately."
    >
      <Section heading="What this is">
        <P>
          HelpCertify builds question banks for a growing list of certifications, but it
          cannot cover every exam. Custom Exam Builder lets you upload a question-and-answer
          document you already have - notes from a course, a study group's shared bank, your
          own practice questions - and turns it into a private practice test and mock exam on
          HelpCertify, scored and tracked the same way as our own content.
        </P>
        <P>
          HelpCertify does not claim to already have every certification's question bank.
          This feature exists specifically for the ones it doesn't.
        </P>
      </Section>

      <Section heading="How it works">
        <UL>
          <li>Buy the Custom Exam Builder add-on once - it is not tied to any certification.</li>
          <li>Upload a .docx file with your questions and answers, in one of the two supported formats below.</li>
          <li>HelpCertify parses it into your own private question set within a few moments.</li>
          <li>Take it as untimed practice or a timed mock exam, whichever you want, as many times as you like.</li>
          <li>Only you can see or access a question bank you upload.</li>
        </UL>
      </Section>

      <Section heading="Supported formats">
        <P>
          Your document needs to follow one of two plain layouts so it can be parsed
          automatically. Download a sample file below, fill in your own questions in the same
          layout, and save it as a .docx (Word) file before uploading.
        </P>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadTemplate('standard')}
            className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:border-brand-400"
          >
            Download sample format (Standard)
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate('cisa_qa')}
            className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:border-brand-400"
          >
            Download sample format (Numbered Q&amp;A)
          </button>
        </div>
      </Section>

      <Section heading="Pricing">
        <div className="flex items-baseline gap-2.5">
          {hasOffer && (
            <span className="text-base text-ink-faint line-through">
              {formatMoney(originalPriceMinor, currency)}
            </span>
          )}
          <span className="text-xl font-bold text-ink">{formatMoney(priceMinor, currency)}</span>
        </div>
        <P>
          Custom Exam Builder is a one-time purchase. Buy it once and upload and manage as many of
          your own question banks as you want - there is no per-upload charge.
        </P>
      </Section>

      <Section heading="Get started">
        <P>
          Create a free HelpCertify account to purchase Custom Exam Builder and upload your
          first question bank.
        </P>
        <a
          href="/register"
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 font-medium text-white"
        >
          Create an account
        </a>
      </Section>
    </MarketingPage>
  );
}
