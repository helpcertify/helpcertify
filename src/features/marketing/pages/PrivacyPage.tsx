import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';
import { GrievanceBlock } from '../GrievanceBlock';
import { PolicyMeta } from '../PolicyMeta';

export function PrivacyPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Privacy Policy"
      intro={
        <>
          How {COMPANY.operatorName} collects and uses personal data on {COMPANY.brand}, and
          the rights you have.
          <PolicyMeta />
        </>
      }
    >
      <Section heading="Who is responsible for your data">
        <P>
          {COMPANY.brand} is a product and service of {COMPANY.operatorName},{' '}
          {COMPANY.operatorType} in {COMPANY.operatorCountry} (registered office:{' '}
          {COMPANY.registeredAddress}). {COMPANY.operatorName} is the Data Fiduciary for the
          personal data described here. This policy is issued under the Digital Personal Data
          Protection Act, 2023 and the Information Technology Act, 2000 and its rules. You can
          contact us about privacy at{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>
          {COMPANY.grievanceOfficer ? `, or our ${COMPANY.grievanceOfficerTitle}, ${COMPANY.grievanceOfficer}` : ''}.
        </P>
      </Section>

      <Section heading="What we collect">
        <UL>
          <li>
            <strong>Account data</strong> - your name, email address, and password
            (stored only as a hash by our authentication provider), plus any profile details
            you add such as a headline or avatar, and your confirmation that you are 18 or
            older.
          </li>
          <li>
            <strong>Learning activity</strong> - the quizzes and practice tests you
            start, your answers, scores, timestamps, and study-plan settings. This is used for
            your own results and analytics and is not shared with anyone outside the providers
            listed below.
          </li>
          <li>
            <strong>Purchase data</strong> - the items you buy, order and payment
            references, coupon usage, and referral activity. Card and bank details are entered
            directly with our payment processor and are never received or stored by us.
          </li>
          <li>
            <strong>Purchase-consent records</strong> - at checkout we record the
            product, price, access period, and policy versions shown to you, together with the
            consent boxes you ticked and when. This is kept as evidence of what was agreed and
            is used only for order fulfilment, refund and dispute review, and legal compliance.
          </li>
          <li>
            <strong>Support and grievance records</strong> - the messages you send us
            and our replies, kept so we can handle and, if needed, evidence how a request was
            resolved.
          </li>
          <li>
            <strong>Technical data</strong> - standard server logs (IP address, browser
            type, pages requested, timestamps) generated when you use the site.
          </li>
        </UL>
        <P>
          Please do not send us sensitive personal data (such as government ID numbers, health
          or financial information) - we do not need it and do not ask for it.
        </P>
      </Section>

      <Section heading="Why we use it, and our legal basis">
        <UL>
          <li>
            To provide the platform - sign-in, exams, practice tests, results, study
            plans, and to grant access to what you have bought. <em>Basis: your consent and
            performance of our contract with you.</em>
          </li>
          <li>
            To send transactional email (verification, receipts, account and policy notices)
            from {COMPANY.noReplyEmail}. <em>Basis: performance of our contract with you.</em>
          </li>
          <li>
            To keep the service secure, prevent abuse and fraud, and diagnose faults.{' '}
            <em>Basis: our legitimate use in protecting the service and its users.</em>
          </li>
          <li>
            To keep tax, accounting, and consumer-dispute records.{' '}
            <em>Basis: compliance with a legal obligation.</em>
          </li>
          <li>
            To personalise your experience and, only if you opt in, to send you occasional
            product news. <em>Basis: your consent, which you can withdraw at any time.</em>
          </li>
        </UL>
        <P>
          We do not sell your personal data, we do not use it for third-party advertising, and
          we do not carry out advertising-driven profiling of any user.
        </P>
      </Section>

      <Section heading="Service providers we share data with">
        <UL>
          <li><strong>Google Firebase</strong> - authentication, database, and file storage.</li>
          <li><strong>Vercel</strong> - website hosting and serverless functions.</li>
          <li><strong>{COMPANY.paymentProcessor}</strong> - payment processing.</li>
          <li><strong>Resend</strong> - delivery of transactional email.</li>
        </UL>
        <P>
          Each processes data only on our written instructions, under a data-processing
          agreement, and only to provide its part of the service. We may also disclose data
          where required by law, by a court or authority, or to establish or defend a legal
          claim.
        </P>
      </Section>

      <Section heading="Where your data is processed">
        <P>
          Some of our processors - including Google/Firebase and Vercel - store and
          process data on servers located outside India, including in the United States. Indian
          law currently permits transfers of personal data to countries that the Central
          Government has not restricted; none are restricted at present. Each processor is
          required by contract to protect your data to a standard consistent with this policy.
        </P>
      </Section>

      <Section heading="How long we keep it">
        <P>
          We keep your account and learning data while your account is active. When you close
          your account, or withdraw the consent an activity relies on, we delete or anonymise
          the related data unless we are required to keep it - for example purchase,
          invoice, and purchase-consent records are kept for the period tax, accounting, and
          consumer-protection law requires (generally up to three years for a possible
          consumer dispute, longer where tax law requires). Server logs are kept for a short
          period for security and troubleshooting and then deleted.
        </P>
      </Section>

      <Section heading="Your rights">
        <P>Under the Digital Personal Data Protection Act, 2023 you can ask us to:</P>
        <UL>
          <li>give you a summary of the personal data we hold about you and how we process it;</li>
          <li>correct, complete, or update your data, or erase data we no longer need;</li>
          <li>address a grievance about how we handle your data (see below);</li>
          <li>
            act on a nomination - you may nominate another person to exercise these
            rights on your behalf if you die or are unable to act.
          </li>
        </UL>
        <P>
          Where an activity relies on your consent, you can withdraw that consent at any time,
          as easily as you gave it - by changing your settings, using the unsubscribe
          link in our emails, or emailing us. Withdrawing consent does not affect processing
          already carried out, and some features will stop working without the data they need.
          To exercise any right, email{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>{' '}
          from your account address; we may ask a question or two to confirm it is you.
        </P>
      </Section>

      <Section heading="Children">
        <P>
          {COMPANY.brand} is only for people aged 18 or older. You must confirm your age when
          you create an account. We do not knowingly collect data from anyone under 18, and we
          do not carry out tracking, behavioural monitoring, or targeted advertising directed
          at children. If you believe a child has created an account, contact our Grievance
          Officer and we will close it and delete the data.
        </P>
      </Section>

      <Section heading="Cookies and local storage">
        <P>
          We use only what is needed to run the site: a session from our authentication
          provider to keep you signed in, and browser local storage for preferences such as
          your light/dark theme and a remembered filter or draft. We do not use third-party
          analytics or advertising cookies. If that ever changes, we will ask for your consent
          first through a cookie banner with a clear &ldquo;reject&rdquo; option.
        </P>
      </Section>

      <Section heading="Security">
        <P>
          We protect your data with reasonable security safeguards appropriate to a platform
          of our size - encryption in transit, access controls, hashed passwords,
          separation of payment data (handled entirely by {COMPANY.paymentProcessor}), and
          regular review of our providers&rsquo; security. No system is perfectly secure; if a
          personal-data breach occurs that is likely to affect you, we will notify you and the
          Data Protection Board of India as required by law.
        </P>
      </Section>

      <Section heading="Changes to this policy">
        <P>
          We update this policy when our practices or the law change. We will change the
          version and effective date above and, for material changes, notify you by email or
          in the app before they take effect. Please review it from time to time.
        </P>
      </Section>

      <GrievanceBlock />
    </MarketingPage>
  );
}
