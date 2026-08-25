import type { ReactElement } from 'react';

// Self-generated (no external image/asset needed) cover art for quiz/practice
// test cards, matching the "product card with an image" look real course
// marketplaces use. Each item deterministically gets one of a handful of
// abstract gradient + icon covers based on a hash of its id, so the same
// item always shows the same cover and different items get visual variety
// — without needing an admin to upload a per-item image.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

interface Variant {
  from: string;
  to: string;
  icon: (props: { className?: string }) => ReactElement;
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <path
        d="M50 8 L86 22 V50 C86 74 71 90 50 96 C29 90 14 74 14 50 V22 Z"
        fill="rgba(255,255,255,0.16)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="3"
      />
      <path d="M35 50 L46 61 L67 38" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function BadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <path d="M32 55 L20 90 L38 82 L50 96 L62 82 L80 90 L68 55" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <circle cx="50" cy="40" r="28" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <path d="M38 40 L47 49 L63 30" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <path d="M50 22 C42 15 24 13 14 16 V72 C24 69 42 71 50 78 Z" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <path d="M50 22 C58 15 76 13 86 16 V72 C76 69 58 71 50 78 Z" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <line x1="50" y1="22" x2="50" y2="78" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <rect x="18" y="55" width="16" height="35" rx="2" fill="rgba(255,255,255,0.85)" />
      <rect x="42" y="38" width="16" height="52" rx="2" fill="rgba(255,255,255,0.85)" />
      <rect x="66" y="18" width="16" height="72" rx="2" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <path d="M30 45 V32 a20 20 0 0 1 40 0 V45" stroke="rgba(255,255,255,0.85)" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="20" y="45" width="60" height="45" rx="8" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <circle cx="50" cy="65" r="6" fill="white" />
      <line x1="50" y1="70" x2="50" y2="80" stroke="white" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function BulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <circle cx="50" cy="42" r="26" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <path d="M42 78 h16 M44 86 h12" stroke="rgba(255,255,255,0.85)" strokeWidth="4" strokeLinecap="round" />
      <line x1="50" y1="42" x2="50" y2="30" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="42" x2="60" y2="35" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="42" x2="40" y2="35" stroke="white" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

const VARIANTS: Variant[] = [
  { from: '#2563eb', to: '#0ea5e9', icon: ShieldIcon },
  { from: '#7c3aed', to: '#c026d3', icon: BadgeIcon },
  { from: '#d97706', to: '#f59e0b', icon: BookIcon },
  { from: '#059669', to: '#10b981', icon: ChartIcon },
  { from: '#4338ca', to: '#6366f1', icon: LockIcon },
  { from: '#be123c', to: '#f43f5e', icon: BulbIcon },
];

export function CourseCoverImage({ seed, className = '' }: { seed: string; className?: string }) {
  const variant = VARIANTS[hashString(seed) % VARIANTS.length];
  const gradId = `cover-grad-${hashString(seed)}`;
  const Icon = variant.icon;

  return (
    <svg viewBox="0 0 320 160" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={variant.from} />
          <stop offset="100%" stopColor={variant.to} />
        </linearGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#${gradId})`} />
      <circle cx="270" cy="20" r="60" fill="rgba(255,255,255,0.08)" />
      <circle cx="30" cy="150" r="50" fill="rgba(255,255,255,0.06)" />
      <g transform="translate(120, 30) scale(0.8)">
        <Icon />
      </g>
    </svg>
  );
}
