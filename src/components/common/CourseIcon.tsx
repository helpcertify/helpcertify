import type { ReactNode } from 'react';

// A small blue icon tile replacing the old full-width colored cover banner
// on the Recommended for You cards (HelpCertify Electric Blue theme) - one
// consistent brand-blue square with a white icon, rather than a different
// saturated color per certification. The specific icon is a deterministic,
// purely decorative pick (hash of the id, with a couple of keyword nudges
// for "security"/"audit" titles) - it doesn't reflect any real category
// taxonomy in the data model, just visual variety within one blue family.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

type IconKind = 'shieldLock' | 'shieldCheck' | 'book' | 'clipboard';

function pickIcon(id: string, title: string, itemType: 'quiz' | 'practiceTest' | 'course'): IconKind {
  if (itemType === 'course') return 'book';
  const t = title.toLowerCase();
  if (t.includes('audit')) return 'shieldCheck';
  if (t.includes('security') || t.includes('manager')) return 'shieldLock';
  if (itemType === 'quiz') return 'book';
  if (hashString(id) % 2 === 0) return 'clipboard';
  return 'book';
}

const ICON_PATHS: Record<IconKind, ReactNode> = {
  shieldLock: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" />
      <rect x="9" y="11" width="6" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.2 11V9.3a1.8 1.8 0 0 1 3.6 0V11" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12.2 11 14.7l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  book: (
    <>
      <path
        d="M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" fill="currentColor" />
      <path d="M8 11h8M8 14.5h8M8 18h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

export function CourseIcon({
  id,
  title,
  itemType,
  className = '',
}: {
  id: string;
  title: string;
  itemType: 'quiz' | 'practiceTest' | 'course';
  className?: string;
}) {
  const kind = pickIcon(id, title, itemType);
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#155EEF] text-white ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        {ICON_PATHS[kind]}
      </svg>
    </div>
  );
}
