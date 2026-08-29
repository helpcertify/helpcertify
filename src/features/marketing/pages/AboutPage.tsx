import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';

export function AboutPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title={`About ${COMPANY.brand}`}
      intro={COMPANY.tagline}
    >
      <Section heading="What HelpCertify is">
        <P>
          {COMPANY.summary}
        </P>
        <P>
          The platform is built around practising with real exam-style questions rather than
          passive video watching: every mock exam and practice test reports a per-question
          breakdown so learners can see exactly which topics to revisit before sitting the
          real certification.
        </P>
      </Section>

      <Section heading="What you can do on the platform">
        <UL>
          <li>Take timed mock exams that mirror the format and pacing of the real certification exam.</li>
          <li>
            Work through large practice-question banks in resumable, batched sessions, picking
            up exactly where you left off.
          </li>
          <li>Follow a personalized study plan built around your target exam date.</li>
          <li>Review ranked results and per-question explanations after every attempt.</li>
        </UL>
      </Section>

      <Section heading="Who operates HelpCertify">
        <P>
          {COMPANY.brand} is operated by {COMPANY.operatorName}, {COMPANY.operatorType} based in{' '}
          {COMPANY.operatorCountry}. {COMPANY.operatorName} is also responsible for billing,
          support, and the handling of personal data described in the{' '}
          <a href="/privacy" className="text-brand-ink underline">Privacy Policy</a>.
        </P>
      </Section>

      <Section heading="Contact">
        <P>
          For questions about the platform, your account, or a purchase, see the{' '}
          <a href="/contact" className="text-brand-ink underline">Contact</a> page.
        </P>
      </Section>
    </MarketingPage>
  );
}
