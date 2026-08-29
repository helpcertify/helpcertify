import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';

export function ContactPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Contact us"
      intro={`Ways to reach the team behind ${COMPANY.brand}.`}
    >
      <Section heading="Email">
        <P>
          The fastest way to reach us is by email at{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          . We aim to respond within 2 business days.
        </P>
        {COMPANY.contactPhone ? (
          <P>
            Phone:{' '}
            <a href={`tel:${COMPANY.contactPhone.replace(/\s+/g, '')}`} className="text-brand-ink underline">
              {COMPANY.contactPhone}
            </a>
            .
          </P>
        ) : null}
        <P>Please include the following where relevant, so we can help without a back-and-forth:</P>
        <UL>
          <li>The email address on your {COMPANY.brand} account.</li>
          <li>For a purchase or refund query: the order or payment reference.</li>
          <li>For a technical issue: the page you were on and what happened.</li>
        </UL>
      </Section>

      <Section heading="Operating entity">
        <P>
          {COMPANY.brand} is a product and service of {COMPANY.operatorName},{' '}
          {COMPANY.operatorType} in {COMPANY.operatorCountry}.
        </P>
        <P>
          Registered office: {COMPANY.registeredAddress}. Tax-registration details are
          available on request to the email address above.
        </P>
        {COMPANY.grievanceOfficer ? (
          <P>
            Grievance officer: {COMPANY.grievanceOfficer} &mdash;{' '}
            <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
              {COMPANY.grievanceEmail}
            </a>
            .
          </P>
        ) : null}
      </Section>

      <Section heading="Billing and payments">
        <P>
          Payments are processed by {COMPANY.paymentProcessor}. Questions about a charge or
          invoice should go to{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>
          .
        </P>
      </Section>

      <Section heading="Refunds">
        <P>
          To request a refund, email{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>{' '}
          from your account address with your order or payment reference, the purchase date,
          and the reason. Digital exam-practice products are generally non-refundable after
          purchase except for the eligible circumstances in the{' '}
          <a href="/refund" className="text-brand-ink underline">Refund &amp; Cancellation
          Policy</a>, or where required by applicable law. Please report payment or access
          problems within 48 hours of purchase where reasonably possible; doing so helps us
          investigate promptly but does not by itself qualify a purchase for a refund.
        </P>
      </Section>

      <Section heading="Technical issues">
        <P>
          Report a technical problem to{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          . We investigate and resolve reported issues first; see the{' '}
          <a href="/support" className="text-brand-ink underline">Support Policy</a> for how
          this works and the resolution timeframe.
        </P>
      </Section>

      <Section heading="Privacy requests">
        <P>
          To access, correct, or delete your personal data, email{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>{' '}
          from your account address. See the{' '}
          <a href="/privacy" className="text-brand-ink underline">Privacy Policy</a> for
          details.
        </P>
      </Section>
    </MarketingPage>
  );
}
