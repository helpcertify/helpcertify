// Small line icons for the exam detail summary strip, sized to sit inline
// with the metric value. Not components - plain JSX constants.
const IC = 'h-4 w-4';

export const MetricIcons = {
  questions: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5h16M4 12h16M4 19h10" strokeLinecap="round" />
    </svg>
  ),
  sets: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5" strokeLinejoin="round" />
    </svg>
  ),
  practiced: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  remaining: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" aria-hidden>
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" className={IC} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
