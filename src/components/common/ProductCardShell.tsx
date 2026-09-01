import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StarRating } from './StarRating';
import { WishlistButton } from './WishlistButton';
import { CourseIcon } from './CourseIcon';
import { ClickHereLink, CategoryBadge } from './CardBits';
import { formatMoney } from '@/utils/currency';

interface ProductCardShellProps {
  id: string;
  // Never 'package' - a certification/package card uses CertificationCard
  // instead (see its own file for why ProductCardShell isn't a fit there).
  itemType: 'quiz' | 'practiceTest';
  title: string;
  category: string;
  skillLevel: string;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  detailHref: string;
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
  extra,
  footer,
}: ProductCardShellProps) {
  return (
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-[#DCE7FF] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-[3px] hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72">
      <div className="relative min-h-[92px] bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] p-4 pb-6">
        <WishlistButton itemType={itemType} itemId={id} variant="inline" className="absolute right-3 top-3" />
        <Link to={detailHref} className="flex items-start gap-3 pr-8">
          <CourseIcon id={id} title={title} itemType={itemType} />
          <h3 className="line-clamp-2 pt-1 text-[15px] font-semibold leading-snug text-[#0F172A]">{title}</h3>
        </Link>
        {/* Bottom-right of the light-blue header, not the old cover-image
            corner - the click affordance that used to sit on the (now
            removed) colored banner. */}
        <ClickHereLink href={detailHref} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2">
          <CategoryBadge category={category} skillLevel={skillLevel} />
        </div>
        {ratingCount > 0 ? (
          <div className="mb-2 flex items-center gap-1.5">
            <StarRating value={ratingAvg} size="sm" />
            <span className="text-xs text-[#64748B]">{ratingAvg.toFixed(1)} ({ratingCount})</span>
          </div>
        ) : (
          <div className="mb-2 text-xs text-[#64748B]">No ratings yet</div>
        )}
        <div className="mb-3 flex items-center gap-2">
          {price > 0 ? (
            <>
              {originalPrice && originalPrice > price && (
                <span className="text-xs text-[#94A3B8] line-through">{formatMoney(originalPrice, currency)}</span>
              )}
              <span className="text-lg font-bold text-[#0F172A]">{formatMoney(price, currency)}</span>
            </>
          ) : (
            <span className="font-bold text-[#16A34A]">Free</span>
          )}
        </div>

        {extra}

        <div className="mt-auto">{footer}</div>
      </div>
    </div>
  );
}
