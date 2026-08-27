import { Link } from 'react-router-dom';

// Shared pieces used by every product card (Practice Exams, Mock Exams,
// Recommended for you, Saved Items, Search Results) so the "this card is
// clickable" and "what is this" signals look and read identically
// everywhere, per request.

// Sits over the bottom-right corner of a card's colored cover banner,
// replacing the small checkmark badge that used to live there — a plain
// checkmark didn't tell anyone it was interactive, this does.
export function ClickHereLink({ href }: { href: string }) {
  return (
    <Link
      to={href}
      className="absolute bottom-2 right-2.5 text-xs font-semibold text-white underline decoration-white/70 underline-offset-2 hover:decoration-white"
    >
      Click here →
    </Link>
  );
}

// A soft blue pill (light background, blue text) instead of plain uppercase
// gray text or a strong saturated fill, so "ISACA · Associate" reads as a
// distinct piece of metadata without competing with the primary CTA for
// attention — the HelpCertify Electric Blue theme's "light blue background"
// token (#E8F0FF) rather than a solid brand-blue fill.
export function CategoryBadge({ category, skillLevel }: { category: string; skillLevel: string }) {
  return (
    <span className="inline-block rounded-md bg-[#E8F0FF] px-2 py-0.5 text-xs font-semibold text-[#155EEF]">
      {category} · {skillLevel}
    </span>
  );
}
