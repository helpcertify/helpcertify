import { create } from 'zustand';
import { COMPANY, EDITABLE_COMPANY_FIELDS, type CompanyInfo } from './companyInfo';

// Live company / contact details. Starts from the compile-time defaults in
// companyInfo.ts (so it renders synchronously during prerender and in the
// first client paint, with no hydration mismatch), then the SPA merges any
// admin overrides from Firestore `appSettings/company` over the top once
// they load — see loadCompanyInfo.ts, called from AppProviders. Marketing /
// legal pages read this via `useCompany()` and never import Firebase, so
// they stay safe for the SSR prerender.
interface CompanyInfoState {
  company: CompanyInfo;
  /** Merge admin overrides (only the editable fields, only non-blank). */
  applyOverrides: (overrides: Partial<Record<keyof CompanyInfo, unknown>>) => void;
}

export const useCompanyInfoStore = create<CompanyInfoState>((set) => ({
  company: COMPANY,
  applyOverrides: (overrides) =>
    set(() => {
      const clean: Partial<CompanyInfo> = {};
      for (const key of EDITABLE_COMPANY_FIELDS) {
        const value = overrides[key];
        if (typeof value === 'string' && value.trim() !== '') clean[key] = value.trim();
      }
      return { company: { ...COMPANY, ...clean } };
    }),
}));

export const useCompany = (): CompanyInfo => useCompanyInfoStore((s) => s.company);
