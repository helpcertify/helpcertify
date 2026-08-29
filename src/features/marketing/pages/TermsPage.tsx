import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';

export function TermsPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Terms of Service"
      intro={`The agreement between you and ${COMPANY.operatorName} for use of ${COMPANY.brand}.`}
    >
      <Section heading="1. Who we are">
        <P>
          {COMPANY.brand} (the &ldquo;Service&rdquo;) is a product and service of{' '}
          {COMPANY.operatorName}, {COMPANY.operatorType} in {COMPANY.operatorCountry}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), with its registered office at{' '}
          {COMPANY.registeredAddress}. By creating an account or using the Service you agree to
          these Terms and to the{' '}
          <a href="/privacy" className="text-brand-ink underline">Privacy Policy</a>. If you do
          not agree, do not use the Service.
        </P>
      </Section>

      <Section heading="2. Your account">
        <UL>
          <li>You must be at least 18 years old and provide accurate registration details.</li>
          <li>You are responsible for keeping your password confidential and for activity under your account.</li>
          <li>One account is for one person; accounts and purchased access are not transferable or shareable.</li>
          <li>Tell us promptly at {COMPANY.contactEmail} if you believe your account has been compromised.</li>
        </UL>
      </Section>

      <Section heading="3. What you can buy">
        <P>
          The Service sells time-limited access to digital exam-preparation content: mock
          exams, practice-question banks, and related study tools. Prices are shown at
          checkout in the currency indicated. Access is granted to your account once payment
          is confirmed and lasts for the access period stated on the product. A free preview
          is available before purchase so you can evaluate the question, answer, and
          explanation format and the general platform experience.
        </P>
      </Section>

      <Section heading="4. Payment">
        <P>
          Payments are collected by {COMPANY.paymentProcessor}. You authorise the charge shown
          at checkout, including any applicable taxes. We do not receive or store your card or
          bank details. Refunds, where available, are governed by the{' '}
          <a href="/refund" className="text-brand-ink underline">Refund &amp; Cancellation
          Policy</a>, and technical issues are handled under the{' '}
          <a href="/support" className="text-brand-ink underline">Support Policy</a>. Digital
          exam-practice products are generally non-refundable after purchase except for the
          eligible circumstances set out in the Refund &amp; Cancellation Policy or where
          required by applicable law; a change of mind after purchase does not by itself
          entitle you to a refund.
        </P>
      </Section>

      <Section heading="5. Acceptable use">
        <P>You agree not to:</P>
        <UL>
          <li>Copy, record, scrape, resell, or publicly post questions, answers, or explanations from the Service.</li>
          <li>Share your login or purchased access with anyone else.</li>
          <li>Attempt to break, probe, or bypass the Service&rsquo;s security or access controls.</li>
          <li>Upload unlawful content or use the Service to infringe anyone&rsquo;s rights.</li>
          <li>Use automated tools to interact with the Service except where we explicitly allow it.</li>
        </UL>
        <P>
          We may suspend or terminate an account that breaches this section, without refund
          where the breach is material.
        </P>
      </Section>

      <Section heading="6. Intellectual property">
        <P>
          All content on the Service &mdash; questions, explanations, study plans, text, and
          design &mdash; belongs to {COMPANY.operatorName} or its licensors. You get a
          personal, non-exclusive, non-transferable licence to use it for your own exam
          preparation for the duration of your access. All other rights are reserved.
        </P>
      </Section>

      <Section heading="7. Certification bodies">
        <P>
          {COMPANY.brand} is an independent preparation service and is not affiliated with or
          endorsed by any certification body. Practice material is not official exam content.
          See the <a href="/disclaimer" className="text-brand-ink underline">Disclaimer</a>.
        </P>
      </Section>

      <Section heading="8. Availability and changes">
        <P>
          We aim to keep the Service available but do not guarantee uninterrupted access, and
          we may change, add, or remove features. Individual practice tests and exams may be
          updated or retired as certification syllabuses change.
        </P>
      </Section>

      <Section heading="9. Support and technical issues">
        <P>
          If you report a technical issue, {COMPANY.brand} will first investigate and attempt
          to resolve it &mdash; for example by fixing the defect, restoring access, resetting
          an affected attempt, correcting your progress, providing equivalent access, or
          extending your access period. Resolution may take up to 7 calendar days depending on
          the issue, and you agree to allow us this reasonable opportunity. A technical issue
          does not automatically qualify a purchase for a refund where the purchased service is
          successfully restored or provided. See the{' '}
          <a href="/support" className="text-brand-ink underline">Support Policy</a> and{' '}
          <a href="/refund" className="text-brand-ink underline">Refund &amp; Cancellation
          Policy</a> for details. Nothing in this section limits rights you have under
          applicable consumer law.
        </P>
      </Section>

      <Section heading="10. Disclaimers and liability">
        <P>
          The Service is provided &ldquo;as is&rdquo;. To the extent permitted by law, we
          exclude implied warranties and we are not liable for indirect or consequential loss,
          or for any outcome of an official certification exam. Nothing in these Terms limits
          liability that cannot be limited by law. Where we are liable, our total liability is
          limited to the amount you paid for the access giving rise to the claim in the 12
          months before the claim.
        </P>
      </Section>

      <Section heading="11. Termination">
        <P>
          You can stop using the Service and ask us to close your account at any time. We may
          suspend or close an account for breach of these Terms or where required by law.
        </P>
      </Section>

      <Section heading="12. Governing law">
        <P>
          These Terms are governed by the laws of {COMPANY.operatorCountry}, and the courts
          with jurisdiction over {COMPANY.jurisdiction} will have exclusive jurisdiction over
          any dispute, subject to any consumer-protection rights you have under local law.
        </P>
      </Section>

      <Section heading="13. Contact">
        <P>
          Questions about these Terms:{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          .
        </P>
      </Section>
    </MarketingPage>
  );
}
