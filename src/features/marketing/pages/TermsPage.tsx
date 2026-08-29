import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';
import { GrievanceBlock } from '../GrievanceBlock';
import { PolicyMeta } from '../PolicyMeta';

export function TermsPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Terms of Service"
      intro={
        <>
          The agreement between you and {COMPANY.operatorName} for use of {COMPANY.brand}.
          <PolicyMeta />
        </>
      }
    >
      <Section heading="1. Who we are">
        <P>
          {COMPANY.brand} (the &ldquo;Service&rdquo;) is a product and service of{' '}
          {COMPANY.operatorName}, {COMPANY.operatorType} in {COMPANY.operatorCountry}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), with its registered office at{' '}
          {COMPANY.registeredAddress}. The Service is a digital service delivered online from
          India. Our customer-care and grievance contact is{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          {COMPANY.contactPhone ? ` / ${COMPANY.contactPhone}` : ''}. By creating an account or
          using the Service you agree to these Terms and to the{' '}
          <a href="/privacy" className="text-brand-ink underline">Privacy Policy</a>. If you do
          not agree, do not use the Service.
        </P>
      </Section>

      <Section heading="2. Your account">
        <UL>
          <li>You must be at least 18 years old and confirm your age when you register.</li>
          <li>You must provide accurate registration details and keep them up to date.</li>
          <li>You are responsible for keeping your password confidential and for activity under your account.</li>
          <li>One account is for one person; accounts and purchased access are not transferable or shareable.</li>
          <li>Tell us promptly at {COMPANY.contactEmail} if you believe your account has been compromised.</li>
        </UL>
      </Section>

      <Section heading="3. What you can buy">
        <P>
          The Service sells access to digital exam-preparation content: mock exams,
          practice-question banks, and related study tools. The product page and the checkout
          order summary show, before you pay, the product name, what is included, the access
          period, and the total price. Access is granted to your account once payment is
          confirmed and lasts for the access period stated on that product. A free preview is
          available before purchase so you can evaluate the question, answer, and explanation
          format and the general platform experience.
        </P>
      </Section>

      <Section heading="4. Price and payment">
        <P>
          Payments are collected by {COMPANY.paymentProcessor}. The price shown at checkout is
          the total you pay and is inclusive of all applicable taxes.{' '}
          {COMPANY.gstin
            ? `Our GSTIN is ${COMPANY.gstin}; a tax invoice is available on request.`
            : `${COMPANY.operatorName} is not currently registered for GST (turnover below the registration threshold); this will be updated here if that changes.`}{' '}
          You authorise the charge shown at checkout. We do not receive or store your card or
          bank details. Refunds, where available, are governed by the{' '}
          <a href="/refund" className="text-brand-ink underline">Refund &amp; Cancellation
          Policy</a>, and technical issues are handled under the{' '}
          <a href="/support" className="text-brand-ink underline">Support Policy</a>. Digital
          exam-practice products are generally non-refundable after purchase except for the
          eligible circumstances set out in the Refund &amp; Cancellation Policy or where
          required by law; a change of mind after purchase does not by itself entitle you to a
          refund.
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
          design &mdash; belongs to {COMPANY.operatorName} or its licensors and is original
          work, not reproduced from any official exam or third-party course. You get a
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

      <Section heading="8. Availability and changes to the Service">
        <P>
          We aim to keep the Service available but do not guarantee uninterrupted access, and
          we may change, add, or remove features. Individual practice tests and exams may be
          updated or retired as certification syllabuses change. We will not remove access you
          have already paid for without providing an equivalent alternative or a remedy under
          the Refund &amp; Cancellation Policy.
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
          Policy</a> for details. Nothing in this section limits rights you have under the
          Consumer Protection Act, 2019 or other applicable law.
        </P>
      </Section>

      <Section heading="10. Your content (reviews and feedback)">
        <P>
          If you post a rating, review, or other content on the Service, you confirm it is
          your own genuine opinion and does not contain anything unlawful, defamatory,
          obscene, misleading, infringing, impersonating, harmful to minors, or spam. You give
          {' '}{COMPANY.operatorName} a non-exclusive, royalty-free licence to display and
          store that content in connection with the Service. We may edit or remove content
          that breaches this section or the law. If you believe content posted by another user
          is unlawful or breaches these Terms, contact our Grievance Officer &mdash; we
          acknowledge such complaints within 24 hours and aim to resolve them within 15 days,
          in line with the Information Technology (Intermediary Guidelines and Digital Media
          Ethics Code) Rules, 2021.
        </P>
      </Section>

      <Section heading="11. Disclaimers and liability">
        <P>
          The Service is provided &ldquo;as is&rdquo;. To the extent permitted by law, we
          exclude implied warranties and we are not liable for indirect or consequential loss,
          or for any outcome of an official certification exam. Where we are liable, our total
          liability is limited to the amount you paid for the access giving rise to the claim
          in the 12 months before the claim. Nothing in these Terms limits or excludes any
          liability that cannot be limited or excluded under Indian law, including liability
          for fraud, for death or personal injury caused by negligence, and any right or
          remedy you have as a consumer under the Consumer Protection Act, 2019 (for example
          for deficiency in service, a defect, or an unfair trade practice).
        </P>
      </Section>

      <Section heading="12. Termination">
        <P>
          You can stop using the Service and ask us to close your account at any time by
          emailing {COMPANY.contactEmail}. We may suspend or close an account for breach of
          these Terms or where required by law. On closure, we handle your data as set out in
          the <a href="/privacy" className="text-brand-ink underline">Privacy Policy</a>{' '}
          &mdash; some records are deleted immediately and some are retained where the law
          requires.
        </P>
      </Section>

      <Section heading="13. Force majeure">
        <P>
          We are not responsible for a failure or delay caused by events beyond our reasonable
          control, including outages of the infrastructure providers we depend on (such as
          {' '}{COMPANY.paymentProcessor}, Google/Firebase, or Vercel), internet or power
          failures, government action, or natural events. We will restore the Service, or
          provide a remedy under the Refund &amp; Cancellation Policy, as soon as reasonably
          practicable.
        </P>
      </Section>

      <Section heading="14. Changes to these Terms">
        <P>
          We may update these Terms. We will change the version and effective date above and,
          for material changes, notify you by email or in the app at least 15 days before they
          take effect. Continued use of the Service after that date means you accept the
          updated Terms; if you do not accept them, you should stop using the Service and may
          close your account.
        </P>
      </Section>

      <Section heading="15. General">
        <UL>
          <li>
            <strong>Assignment</strong> &ndash; you may not transfer your rights under these
            Terms. We may transfer ours to a successor of the business, on notice to you.
          </li>
          <li>
            <strong>Severability</strong> &ndash; if any part of these Terms is found
            unenforceable, the rest continues to apply.
          </li>
          <li>
            <strong>Waiver</strong> &ndash; not enforcing a term on one occasion does not
            waive our right to enforce it later.
          </li>
          <li>
            <strong>Entire agreement</strong> &ndash; these Terms, the Privacy Policy, the
            Refund &amp; Cancellation Policy, the Support Policy, and the Disclaimer are the
            whole agreement between us about the Service.
          </li>
          <li>
            <strong>Notices</strong> &ndash; we give notice to you by email to your account
            address or by posting on the Service; you give notice to us at{' '}
            {COMPANY.contactEmail}.
          </li>
        </UL>
      </Section>

      <Section heading="16. Governing law and disputes">
        <P>
          These Terms are governed by the laws of India. If you are a consumer, nothing here
          affects your right under the Consumer Protection Act, 2019 to bring a complaint
          before the Consumer Disputes Redressal Commission with jurisdiction where you reside
          or work. For any other dispute, the courts at {COMPANY.jurisdiction} have
          jurisdiction. Before going to court, please raise the matter through our grievance
          redressal process below so we have a chance to resolve it.
        </P>
      </Section>

      <GrievanceBlock />
    </MarketingPage>
  );
}
