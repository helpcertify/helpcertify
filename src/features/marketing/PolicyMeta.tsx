import { useCompany } from './companyInfoStore';

// Effective date + version line shown at the top of each legal page -
// standard practice and what the e-commerce and data-protection rules
// expect on a dated, versioned policy.
export function PolicyMeta() {
  const COMPANY = useCompany();
  return (
    <p className="mt-2 text-xs text-ink-faint">
      Effective date: {COMPANY.legalLastUpdated} &nbsp;&middot;&nbsp; Version {COMPANY.policyVersion}
    </p>
  );
}
