import { MarketingPage, P, Section, UL } from '../MarketingPage';
import { useCompany } from '../companyInfoStore';
import { GrievanceBlock } from '../GrievanceBlock';
import { PolicyMeta } from '../PolicyMeta';

export function RefundPage() {
  const COMPANY = useCompany();
  return (
    <MarketingPage
      title="Refund & Cancellation Policy"
      intro={
        <>
          When a purchase on {COMPANY.brand} can be refunded, and how technical issues are
          handled.
          <PolicyMeta />
        </>
      }
    >
      <Section heading="Your consumer rights come first">
        <P>
          This policy does not take away any right you have under the Consumer Protection Act,
          2019. If a product is not as described, is defective, or the service you paid for is
          not delivered, you are entitled to a remedy &mdash; regardless of the exclusions
          listed further below.
        </P>
      </Section>

      <Section heading="General rule">
        <P>
          {COMPANY.brand} sells digital exam-preparation content &mdash; practice questions,
          answers, explanations, mock examinations, and progress tracking &mdash; and access is
          granted to your account immediately after payment. Purchases are generally
          non-refundable after purchase, except for the specific eligible circumstances
          described below or where a refund is required by applicable law.
        </P>
        <P>
          A free preview is available before you buy so you can evaluate the question format,
          answer format, explanations, and general platform experience. Because you can
          evaluate the service before purchasing, a change of mind after purchase does not
          automatically qualify for a refund.
        </P>
      </Section>

      <Section heading="Circumstances that may be eligible for a refund">
        <UL>
          <li>
            <strong>A. Duplicate or failed payment</strong> &ndash; if you are accidentally
            charged more than once for the same purchase, or money is debited but no order is
            created and no access is granted, the extra or failed charge is refunded after
            verification.
          </li>
          <li>
            <strong>A1. Payment succeeded but access was not granted</strong> &ndash; if your
            payment goes through but the purchased access does not unlock, we will restore it
            immediately; if we cannot, the payment is refunded in full &mdash; the service was
            not delivered.
          </li>
          <li>
            <strong>B. Service cannot be provided</strong> &ndash; if payment has been received
            but {COMPANY.brand} is unable to provide the purchased service, we will first
            attempt to resolve the issue. If we cannot reasonably provide the purchased service
            after investigation and remediation, an appropriate remedy, including a refund
            where applicable, may be provided.
          </li>
          <li>
            <strong>C. A material included feature cannot be delivered</strong> &ndash; if we
            are unable to provide a material feature or service expressly included in the
            product description at the time of purchase, we will first attempt to correct or
            restore it. A refund or other appropriate remedy may be considered only when the
            material issue cannot reasonably be resolved.
          </li>
          <li>
            <strong>D. Applicable consumer law</strong> &ndash; nothing in this policy or in
            the <a href="/terms" className="text-brand-ink underline">Terms of Service</a>{' '}
            restricts any rights or remedies you are entitled to under applicable Indian
            consumer law.
          </li>
        </UL>
      </Section>

      <Section heading="Circumstances that do not normally qualify for a refund">
        <P>The following do not normally qualify for a refund:</P>
        <UL>
          <li>You change your mind after purchase, or decide you no longer need the certification.</li>
          <li>You do not use the purchased service.</li>
          <li>You do not like the questions after purchase, or believe they are too easy or too difficult.</li>
          <li>
            You do not like the explanations or learning style, where the functionality is as
            described in the preview or product description.
          </li>
          <li>You fail the actual certification examination, or pass it earlier than expected.</li>
          <li>Your examination date changes.</li>
          <li>
            You selected the wrong certification or product despite it being clearly identified
            and confirmed during checkout.
          </li>
          <li>You purchased without using the available free preview.</li>
          <li>
            You experience a supported browser, device, or local network issue that is not
            caused by {COMPANY.brand}.
          </li>
          <li>
            You violate the account-sharing, content-protection, scraping, copying, or other
            platform rules in the Terms of Service.
          </li>
          <li>
            You have substantially consumed or accessed the digital content and then request a
            refund for change-of-mind reasons.
          </li>
        </UL>
        <P>
          These exclusions are not used to override any rights available to you under
          applicable consumer law.
        </P>
      </Section>

      <Section heading="Technical issues">
        <P>
          A technical issue does not automatically result in a refund. {COMPANY.brand} must
          first be given a reasonable opportunity to investigate and resolve a reported issue
          &mdash; for example login or OTP problems, questions not loading, answer or
          explanation display issues, mock-examination issues, progress-tracking problems,
          temporary service interruption, or account-access problems.
        </P>
        <P>We may resolve an issue by:</P>
        <UL>
          <li>Fixing the defect or restoring access;</li>
          <li>Resetting an affected mock or practice attempt;</li>
          <li>Correcting progress or account information;</li>
          <li>Providing equivalent access;</li>
          <li>Extending your access period to compensate for material downtime.</li>
        </UL>
        <P>
          {COMPANY.brand} will make reasonable efforts to investigate and resolve reported
          technical issues as quickly as possible. Depending on the nature and complexity of
          the issue, resolution may take up to 7 calendar days. Please allow us this reasonable
          resolution opportunity.
        </P>
        <P>
          A technical issue does not qualify for a refund where {COMPANY.brand} successfully
          restores or provides the purchased service. If a material technical issue
          substantially prevents you from using the purchased service and we are unable to
          reasonably resolve it within the applicable resolution period, the case is escalated
          for an appropriate remedy, which may include an extension, credit, or refund where
          applicable. See the{' '}
          <a href="/support" className="text-brand-ink underline">Support Policy</a> for how
          issues are handled.
        </P>
      </Section>

      <Section heading="Reporting purchase or access problems">
        <P>
          Customers are encouraged to report payment, access, or purchase-related issues within
          48 hours of purchase wherever reasonably possible, so that {COMPANY.brand} can
          investigate promptly. Reporting an issue within 48 hours does not automatically
          qualify the purchase for a refund &mdash; the 48-hour period is a reporting and
          contact window, not a guarantee that the purchase will be refunded.
        </P>
      </Section>

      <Section heading="How to request a refund">
        <P>
          Email{' '}
          <a href={`mailto:${COMPANY.grievanceEmail}`} className="text-brand-ink underline">
            {COMPANY.grievanceEmail}
          </a>{' '}
          from your account address with your order or payment reference, the purchase date,
          and a description of the issue. We review each request against the purchase record,
          the reason given, payment status, whether the service was delivered, usage history,
          any prior support cases, and the applicable policy version, and respond with an
          outcome of approved, rejected, or needs further review.
        </P>
      </Section>

      <Section heading="Timelines">
        <P>
          We acknowledge every refund or purchase-related request within 48 hours. We decide
          on the request within 7 business days of receiving the order reference and any
          information we need to investigate. If a refund is approved, we initiate it to your
          original payment method through {COMPANY.paymentProcessor} within 3&ndash;5 business
          days of approval; your bank or card issuer may take a further 5&ndash;10 business
          days to credit it. Access related to a refunded purchase is removed when the refund
          is issued.
        </P>
      </Section>

      <Section heading="Chargebacks">
        <P>
          If you raise a chargeback or dispute with your bank for a transaction we would have
          refunded anyway, please also contact us so we can resolve it directly and avoid the
          payment being processed twice.
        </P>
      </Section>

      <Section heading="If you are not satisfied">
        <P>
          If you disagree with our decision, you can escalate it through the grievance
          redressal process below, and, if it is still not resolved, to the consumer
          authorities named there.
        </P>
      </Section>

      <GrievanceBlock />
    </MarketingPage>
  );
}
