// Shared pieces used by every product card (Practice Exams, Mock Exams,
// Recommended for you, Saved Items, Search Results) so the "this card is
// clickable" and "what is this" signals look and read identically
// everywhere, per request.
//
// ClickHereLink (a "Click here ->" text link on the gradient-header
// fallback) used to live here - removed per Phase 0's audit, which
// flagged it as exactly the kind of vague card-CTA the redesign calls to
// remove. ProductCardShell now makes that whole header one Link instead,
// so the affordance is a bigger click target rather than a text label.

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

// A small solid-green pill flagging genuinely recent content (see
// isRecentlyPublished) - sits next to CategoryBadge rather than on the
// cover image, so it never collides with ProductCardShell's discount
// ribbon or the wishlist heart.
export function NewBadge() {
  return <span className="inline-block rounded-md bg-success px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">New</span>;
}
