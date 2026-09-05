import { Link } from 'react-router-dom';

// Shared pieces used by every product card (Practice Exams, Mock Exams,
// Recommended for you, Saved Items, Search Results) so the "this card is
// clickable" and "what is this" signals look and read identically
// everywhere, per request.

// Sits at the bottom-right of a card's light-blue header section, telling
// the learner the card itself is clickable (not just its title/icon) -
// blue-on-light-blue since the header is now a soft gradient rather than
// the old dark colored banner (white text would have no contrast here).
export function ClickHereLink({ href }: { href: string }) {
  return (
    <Link
      to={href}
      className="absolute bottom-2 right-3 text-xs font-semibold text-brand-ink underline decoration-brand-ink/60 underline-offset-2 hover:decoration-brand-ink"
    >
      Click here →
    </Link>
  );
}

// A soft blue pill (light background, blue text) instead of plain uppercase
// gray text or a strong saturated fill, so "ISACA · Associate" reads as a
// distinct piece of metadata without competing with the primary CTA for
// attention - the HelpCertify Electric Blue theme's "light blue background"
// token (#E8F0FF) rather than a solid brand-blue fill.
export function CategoryBadge({ category, skillLevel }: { category: string; skillLevel: string }) {
  return (
    <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-ink">
      {category} · {skillLevel}
    </span>
  );
}
