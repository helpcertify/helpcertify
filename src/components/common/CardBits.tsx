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

// One blue pill instead of plain uppercase gray text, so "ISACA · Associate"
// reads as a distinct piece of metadata rather than blending into the rest
// of the card's muted text.
export function CategoryBadge({ category, skillLevel }: { category: string; skillLevel: string }) {
  return (
    <span className="inline-block rounded bg-[#1D4ED8] px-2 py-0.5 text-xs font-semibold text-white">
      {category} · {skillLevel}
    </span>
  );
}
