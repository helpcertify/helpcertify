import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';

export function PrivacyPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Privacy Policy"
      intro={`How ${COMPANY.operatorName} collects and uses personal data on ${COMPANY.brand}.`}
    >
      <Section heading="Who is responsible for your data">
        <P>
          {COMPANY.brand} is a product and service of {COMPANY.operatorName},{' '}
          {COMPANY.operatorType} in {COMPANY.operatorCountry} (registered office:{' '}
          {COMPANY.registeredAddress}), which is the controller of the personal data described
          here. You can contact us about privacy at{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          .
        </P>
      </Section>

      <Section heading="What we collect">
        <UL>
          <li>
            <strong>Account data</strong> &ndash; your name, email address, and password
            (stored only as a hash by our authentication provider), plus any profile details
            you add such as a headline or avatar.
          </li>
          <li>
            <strong>Learning activity</strong> &ndash; the quizzes and practice tests you
            start, your answers, scores, timestamps, and study-plan settings.
          </li>
          <li>
            <strong>Purchase data</strong> &ndash; the items you buy, order and payment
            references, coupon usage, and referral activity. Card and bank details are entered
            directly with our payment processor and are never received or stored by us.
          </li>
          <li>
            <strong>Purchase-consent records</strong> &ndash; at checkout we record the
            product, price, access period, and policy versions shown to you, together with the
            consent boxes you ticked and when. This is kept as evidence of what was agreed and
            is used only for order fulfilment, refund and dispute review, and legal compliance.
          </li>
          <li>
            <strong>Technical data</strong> &ndash; standard server logs (IP address, browser
            type, pages requested) generated when you use the site.
          </li>
        </UL>
      </Section>

      <Section heading="How we use it">
        <UL>
          <li>To provide the platform: sign-in, exams, practice tests, results, and study plans.</li>
          <li>To process purchases and grant access to what you have bought.</li>
          <li>To send transactional email (verification, receipts, account notices) from {COMPANY.noReplyEmail}.</li>
          <li>To keep the service secure, prevent abuse, and diagnose faults.</li>
          <li>To comply with tax, accounting, and other legal obligations.</li>
        </UL>
        <P>
          We do not sell your personal data, and we do not use it for third-party advertising.
        </P>
      </Section>

      <Section heading="Service providers we share data with">
        <UL>
          <li><strong>Google Firebase</strong> &ndash; authentication, database, and file storage.</li>
          <li><strong>Vercel</strong> &ndash; website hosting and serverless functions.</li>
          <li><strong>{COMPANY.paymentProcessor}</strong> &ndash; payment processing.</li>
          <li><strong>Resend</strong> &ndash; delivery of transactional email.</li>
        </UL>
        <P>
          Each processes data only on our instructions and only to provide their part of the
          service. Some of these providers operate servers outside {COMPANY.operatorCountry};
          where that happens, the transfer is covered by the provider&rsquo;s own safeguards.
        </P>
      </Section>

      <Section heading="How long we keep it">
        <P>
          Account and learning data is kept while your account is active. Purchase, invoice,
          and purchase-consent records are kept for as long as tax, accounting, and
          consumer-protection law requires. You can ask us to delete your account at any time
          (see below); records we are legally required to retain are kept until that
          obligation ends and are then deleted.
        </P>
      </Section>

      <Section heading="Your choices">
        <UL>
          <li>Access or correct most of your data directly in your profile settings.</li>
          <li>
            Request a copy, correction, or deletion of your data by emailing{' '}
            <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
              {COMPANY.contactEmail}
            </a>{' '}
            from your account address.
          </li>
          <li>Unsubscribe from any non-essential email using the link in that email.</li>
        </UL>
      </Section>

      <Section heading="Cookies and local storage">
        <P>
          We use only what is needed to run the site: a session from our authentication
          provider to keep you signed in, and browser local storage for preferences such as
          your light/dark theme. We do not use third-party analytics or advertising cookies.
        </P>
      </Section>

      <Section heading="Children">
        <P>
          {COMPANY.brand} is intended for users aged 18 and over and is not directed at
          children.
        </P>
      </Section>

      <Section heading="Changes">
        <P>
          If we change this policy we will update the date below and, for material changes,
          notify you by email or in the app.
        </P>
      </Section>

      <Section heading="Contact">
        <P>
          Privacy questions and requests:{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          .
        </P>
      </Section>
    </MarketingPage>
  );
}
