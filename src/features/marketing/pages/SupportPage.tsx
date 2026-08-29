import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';
import { GrievanceBlock } from '../GrievanceBlock';
import { PolicyMeta } from '../PolicyMeta';

export function SupportPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Support Policy"
      intro={
        <>
          How {COMPANY.brand} investigates and resolves reported issues, and the timeframe you
          can expect.
          <PolicyMeta />
        </>
      }
    >
      <Section heading="Reporting an issue">
        <P>
          If something is not working, contact us at{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>{' '}
          or through the <a href="/contact" className="text-brand-ink underline">Contact</a>{' '}
          page. Signed-in learners can also reach these links from the in-app Help page.
          Please include the email on your account, the page you were on, what you expected,
          and what happened.
        </P>
      </Section>

      <Section heading="Issues we help with">
        <UL>
          <li>Login and OTP problems</li>
          <li>Questions not loading</li>
          <li>Answer or explanation display issues</li>
          <li>Mock-examination issues</li>
          <li>Progress-tracking problems</li>
          <li>Temporary service interruption</li>
          <li>Account-access problems</li>
          <li>Other application defects</li>
        </UL>
      </Section>

      <Section heading="How we resolve issues">
        <P>
          {COMPANY.brand} must first be given a reasonable opportunity to investigate and
          resolve a reported issue. Depending on the issue, we may:
        </P>
        <UL>
          <li>Fix the defect;</li>
          <li>Restore access;</li>
          <li>Reset an affected mock or practice attempt;</li>
          <li>Correct progress or account information;</li>
          <li>Provide equivalent access;</li>
          <li>Extend your access period to compensate for material downtime.</li>
        </UL>
      </Section>

      <Section heading="Resolution timeframe">
        <P>
          We acknowledge every support request within 48 hours. {COMPANY.brand} will make
          reasonable efforts to investigate and resolve reported technical issues as quickly as
          possible; depending on the nature and complexity of the issue, resolution may take up
          to 7 calendar days. The customer must allow {COMPANY.brand} this reasonable
          resolution opportunity.
        </P>
        <P>
          A technical issue does not automatically qualify a purchase for a refund where{' '}
          {COMPANY.brand} successfully restores or provides the purchased service.
        </P>
        <P>
          If your request is a formal consumer grievance, it is handled by our Grievance
          Officer, who acknowledges it within 48 hours and works to resolve it within 30 days.
          A complaint about content another user has posted (such as a review) is acknowledged
          within 24 hours and resolved within 15 days. See the grievance redressal section
          below.
        </P>
      </Section>

      <Section heading="Escalation">
        <P>
          If a material technical issue substantially prevents you from using the purchased
          service and {COMPANY.brand} is unable to reasonably resolve it within the applicable
          resolution period, the case is escalated for an appropriate remedy, which may include
          an extension, credit, or refund where applicable. Refund eligibility is governed by
          the <a href="/refund" className="text-brand-ink underline">Refund &amp; Cancellation
          Policy</a>.
        </P>
      </Section>

      <Section heading="Contact">
        <P>
          Support:{' '}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-brand-ink underline">
            {COMPANY.contactEmail}
          </a>
          {COMPANY.contactPhone ? (
            <>
              {' '}/{' '}
              <a href={`tel:${COMPANY.contactPhone.replace(/\s+/g, '')}`} className="text-brand-ink underline">
                {COMPANY.contactPhone}
              </a>
            </>
          ) : null}
          .
        </P>
      </Section>

      <GrievanceBlock />
    </MarketingPage>
  );
}
