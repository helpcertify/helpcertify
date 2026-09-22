import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StarRating } from './StarRating';
import { WishlistButton } from './WishlistButton';
import { CourseIcon } from './CourseIcon';
import { CategoryBadge, NewBadge } from './CardBits';
import { PriceTag } from './PriceTag';
import { discountPercent } from '@/utils/currency';
import { isRecentlyPublished } from '@/utils/formatDate';

// Below this, a ribbon reads as noise rather than a real deal - only a
// genuinely large, admin-set discount earns the extra visual weight on top
// of PriceTag's own "N% off" badge.
const RIBBON_THRESHOLD_PCT = 20;

interface ProductCardShellProps {
  id: string;
  // Never 'package' - a certification/package card uses CertificationCard
  // instead (see its own file for why ProductCardShell isn't a fit there).
  itemType: 'quiz' | 'practiceTest' | 'course';
  title: string;
  category: string;
  skillLevel: string;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  detailHref: string;
  // Optional cover photo (courses get one auto-matched from Pexels at
  // publish - see api/content-admin.ts). When absent the card falls back
  // to the gradient header + CourseIcon tile.
  coverImageUrl?: string | null;
  // When present and recent (see isRecentlyPublished), shows a "New" badge
  // next to the category pill. Optional since not every caller has this
  // loaded (or wants it - Billing & Orders' purchase-history cards, for
  // example, care about when it was bought, not when it was published).
  createdAt?: unknown;
  // Shorter cover + tighter padding for the home-page discovery rows
  // ("Courses to explore", "New courses") where the row should not dominate
  // the page. Anatomy and width stay identical everywhere else.
  compact?: boolean;
  // Optional page-specific facts between the price and the footer (Billing
  // & Orders' purchase date/answered-progress/duration line, for example) -
  // most callers don't need this at all.
  extra?: ReactNode;
  // Each page keeps its own owned/in-cart/reattempt/session-duration/study-
  // goal logic - this shell only owns the look (cover, badge, rating,
  // price), not the action buttons, since that logic genuinely differs per
  // page and per item type.
  footer: ReactNode;
}

// The one HelpCertify Electric Blue card shell, used everywhere a quiz or
// practice test is browsable (Recommended for You, Practice Exams, Mock
// Exams, Saved Items) so every card in the app is pixel-identical in size,
// color, and anatomy - only the footer actions differ per page. Fixed
// width (not a stretching grid cell) is deliberate, on request, so the same
// card reads as the same size no matter which page or how wide its
// container is.
export function ProductCardShell({
  id,
  itemType,
  title,
  category,
  skillLevel,
  ratingAvg,
  ratingCount,
  price,
  originalPrice,
  currency,
  detailHref,
  coverImageUrl,
  createdAt,
  compact,
  extra,
  footer,
}: ProductCardShellProps) {
  const isNew = isRecentlyPublished(createdAt);
  const pct = discountPercent(price, originalPrice);
  const showRibbon = pct >= RIBBON_THRESHOLD_PCT;
  const ribbon = showRibbon ? (
    <div className="absolute left-3 top-3 rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
      Save {pct}%
    </div>
  ) : null;

  return (
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-surface-border bg-surface-raised shadow-card transition-all duration-150 hover:-translate-y-[3px] hover:border-brand-500/30 hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72">
      {/* The cover (or gradient fallback) occupies the top ~half of the card
          - a fixed height (not an aspect box, which grew the card), sized so
          the image and the details below it split the card roughly 50/50
          while the card keeps its previous overall height. */}
      {coverImageUrl ? (
        <Link to={detailHref} className={`relative block ${compact ? 'h-32' : 'h-36'} overflow-hidden`}>
          <img src={coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          {ribbon}
          <WishlistButton itemType={itemType} itemId={id} variant="overlay" className="absolute right-3 top-3" />
        </Link>
      ) : (
        // The whole gradient region is one Link (not just the icon/title),
        // so the card is clickable everywhere a learner might tap it -
        // Phase 0's audit flagged the old "Click here" text link here as
        // exactly the kind of vague affordance the redesign calls to
        // remove; a bigger click target makes the text unnecessary rather
        // than needing a replacement label. WishlistButton still works
        // inside it - it stops its own click from bubbling to this Link.
        <Link
          to={detailHref}
          className={`relative flex flex-col justify-between bg-gradient-to-br from-brand-50 to-brand-50 p-3 ${compact ? 'h-32' : 'h-36'}`}
        >
          {ribbon}
          <WishlistButton itemType={itemType} itemId={id} variant="inline" className="absolute right-3 top-3" />
          <div className="flex items-start gap-3 overflow-hidden pr-8 pt-4">
            <CourseIcon id={id} title={title} itemType={itemType} />
            <h3 className="line-clamp-3 pt-1 text-[15px] font-semibold leading-snug text-ink">{title}</h3>
          </div>
        </Link>
      )}
      {coverImageUrl && (
        <div className={compact ? 'px-3 pt-2' : 'px-4 pt-3'}>
          <Link to={detailHref}>
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{title}</h3>
          </Link>
        </div>
      )}
      <div className={`flex flex-1 flex-col ${compact ? 'gap-0 p-3' : 'p-4'}`}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={category} skillLevel={skillLevel} />
          {isNew && <NewBadge />}
        </div>
        {ratingCount > 0 ? (
          <div className="mb-2 flex items-center gap-1.5">
            <StarRating value={ratingAvg} size="sm" />
            <span className="text-xs text-ink-faint">{ratingAvg.toFixed(1)} ({ratingCount})</span>
          </div>
        ) : (
          <div className="mb-2 text-xs text-ink-faint">No ratings yet</div>
        )}
        <div className="mb-3">
          <PriceTag price={price} originalPrice={originalPrice} currency={currency} size="md" />
        </div>

        {extra}

        <div className="mt-auto">{footer}</div>
      </div>
    </div>
  );
}
