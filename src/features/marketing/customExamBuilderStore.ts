import { create } from 'zustand';

// Live Custom Exam Builder price/offer/availability. Starts from these
// compile-time defaults (so it renders synchronously during prerender and
// the first client paint, with no hydration mismatch), then the SPA merges
// the admin-editable appSettings/customExamBuilder doc over the top once it
// loads - see loadCustomExamBuilderInfo.ts, called from AppProviders.
// BuildYourOwnExamPage.tsx reads this via useCustomExamBuilderInfo() and
// never imports Firebase directly, so it stays safe for the SSR prerender -
// same reasoning as companyInfoStore.ts.
export interface CustomExamBuilderInfo {
  priceMinor: number;
  originalPriceMinor: number | null;
  currency: 'INR' | 'USD';
  isEnabled: boolean;
}

const DEFAULTS: CustomExamBuilderInfo = {
  priceMinor: 49900,
  originalPriceMinor: null,
  currency: 'INR',
  isEnabled: true,
};

interface CustomExamBuilderState {
  info: CustomExamBuilderInfo;
  applyOverrides: (overrides: Partial<CustomExamBuilderInfo>) => void;
}

export const useCustomExamBuilderStore = create<CustomExamBuilderState>((set) => ({
  info: DEFAULTS,
  applyOverrides: (overrides) => set((s) => ({ info: { ...s.info, ...overrides } })),
}));

export const useCustomExamBuilderInfo = (): CustomExamBuilderInfo =>
  useCustomExamBuilderStore((s) => s.info);
