import { MarketingPage, P, Section } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';

export function DisclaimerPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Disclaimer"
      intro={`How to read the practice material and results on ${COMPANY.brand}.`}
    >
      <Section heading="Not affiliated with certification bodies">
        <P>
          {COMPANY.brand} is an independent exam-preparation service. It is not affiliated
          with, endorsed by, sponsored by, or otherwise associated with ISACA, (ISC)&sup2;,
          AWS, Microsoft, PMI, CompTIA, or any other certification body or trademark holder.
          All certification names, exam names, and related trademarks are the property of
          their respective owners and are used only to describe the exams that our practice
          material is designed to help you prepare for.
        </P>
      </Section>

      <Section heading="Practice material is not real exam content">
        <P>
          The questions, mock exams, and practice tests on {COMPANY.brand} are original
          preparation material written to reflect the style, format, and subject areas of the
          corresponding certification exams. They are not actual exam questions and are not
          reproduced from any official question pool. Wording, weighting, and exam formats
          change over time; always check the current official exam guide from the relevant
          certification body.
        </P>
      </Section>

      <Section heading="Original content">
        <P>
          All questions, answers, explanations, study plans, and other learning material on
          {' '}{COMPANY.brand} are original works created by {COMPANY.operatorName}. They are
          not copied or reproduced from any official examination, question bank, textbook, or
          third-party course. Certification names and exam names are used only to describe
          what our material helps you prepare for.
        </P>
      </Section>

      <Section heading="No guarantee of results">
        <P>
          Preparing with {COMPANY.brand} does not guarantee that you will pass any exam or
          obtain any certification. Practice scores, predicted readiness, and analytics are
          indicative study aids only and are not a prediction of your official exam result.
        </P>
      </Section>

      <Section heading="No professional advice">
        <P>
          Content on {COMPANY.brand} is provided for general educational purposes and does not
          constitute professional, legal, financial, or security advice. You are responsible
          for how you apply what you learn.
        </P>
      </Section>

      <Section heading="External links">
        <P>
          Where the platform links to third-party websites or resources, those are provided
          for convenience only. {COMPANY.operatorName} does not control and is not responsible
          for the content, accuracy, or practices of any third-party site.
        </P>
      </Section>

      <Section heading="Contact">
        <P>
          Questions about this disclaimer can be sent to{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          .
        </P>
      </Section>
    </MarketingPage>
  );
}
