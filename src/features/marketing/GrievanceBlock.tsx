import { P, Section, UL } from './MarketingPage';
import { useCompany } from './companyInfoStore';

// Single canonical grievance-redressal block reused on Privacy, Terms,
// Refund, Support and Contact so the officer, timelines and escalation
// path can never drift between pages. Timelines follow the Consumer
// Protection (E-Commerce) Rules 2020 (acknowledge within 48 hours, resolve
// within a month) and the IT (Intermediary Guidelines) Rules 2021 for
// complaints about user-posted content (acknowledge within 24 hours,
// resolve within 15 days). Escalation points are the statutory ones under
// Indian law.
export function GrievanceBlock() {
  const COMPANY = useCompany();
  return (
    <Section heading="Grievance redressal">
      <P>
        If you have a complaint about your data, a purchase, our content, or the service, our
        Grievance Officer will help.
      </P>
      <UL>
        {COMPANY.grievanceOfficer && (
          <li>
            <strong>{COMPANY.grievanceOfficer}</strong>
            {COMPANY.grievanceOfficerTitle ? `, ${COMPANY.grievanceOfficerTitle}` : ''}
          </li>
        )}
        <li>
          Email:{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>
        </li>
        {COMPANY.contactPhone && (
          <li>
            Phone:{' '}
            <a href={`tel:${COMPANY.contactPhone.replace(/\s+/g, '')}`} className="text-brand-ink underline">
              {COMPANY.contactPhone}
            </a>
          </li>
        )}
        <li>Post: {COMPANY.operatorName}, {COMPANY.registeredAddress}</li>
      </UL>
      <P>
        We acknowledge every grievance within 48 hours and work to resolve it within 30 days.
        A complaint about content posted by another user (for example a review) is
        acknowledged within 24 hours and resolved within 15 days. Please include your account
        email and any order or reference number so we can act quickly.
      </P>
      <P>If you are not satisfied with our response, you can escalate:</P>
      <UL>
        <li>
          <strong>Data / privacy matters</strong> &ndash; to the Data Protection Board of
          India, once it is operational, under the Digital Personal Data Protection Act, 2023.
        </li>
        <li>
          <strong>Consumer matters</strong> &ndash; to the National Consumer Helpline
          (call 1915 or visit consumerhelpline.gov.in), or to the Consumer Disputes Redressal
          Commission with jurisdiction where you reside or work, under the Consumer Protection
          Act, 2019.
        </li>
        <li>
          <strong>Security incidents</strong> &ndash; to CERT-In (cert-in.org.in).
        </li>
      </UL>
    </Section>
  );
}
