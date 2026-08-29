import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { wishlistApi } from '@/features/students/api/wishlistApi';
import { useUiStore } from '@/store/useUiStore';
import { HeartIcon } from './icons';

interface WishlistButtonProps {
  // Never 'package' — a certification/package card has no wishlist heart
  // this phase (see CertificationCard.tsx).
  itemType: 'quiz' | 'practiceTest';
  itemId: string;
  className?: string;
  // 'overlay' (default): white icon + dark scrim, for sitting on top of a
  // cover image whose color is unpredictable. 'inline': theme-aware neutral
  // icon with no scrim, for sitting on a plain surface/card background
  // (detail pages). Kept as a resolved prop rather than something callers
  // fight over via className — two color utilities on the same element
  // have equal CSS specificity, so which one "wins" depends on generated
  // stylesheet order, not JSX order; a variant prop resolves it in JS
  // instead of gambling on that.
  variant?: 'overlay' | 'inline';
}

// A heart toggle reused on every browse card and both detail pages. Reads
// and writes through the same ['student','wishlist'] query everywhere, so
// toggling on a card immediately reflects on the detail page (and back)
// with no manual refetch needed. Meant to sit as an absolutely-positioned
// sibling next to (not nested inside) a card's own <Link> to the detail
// page — nesting a <button> inside an <a> is invalid HTML, so callers
// should wrap both in a shared `relative` container instead of nesting.
export function WishlistButton({ itemType, itemId, className = '', variant = 'overlay' }: WishlistButtonProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['student', 'wishlist'], queryFn: wishlistApi.getWishlist });
  const inWishlist = (data?.items ?? []).some((i) => i.itemType === itemType && i.itemId === itemId);

  const mutation = useMutation({
    mutationFn: () => (inWishlist ? wishlistApi.removeItem(itemType, itemId) : wishlistApi.addItem(itemType, itemId)),
    onSuccess: (result) => {
      queryClient.setQueryData(['student', 'wishlist'], result);
      pushToast(inWishlist ? 'Removed from wishlist' : 'Added to wishlist', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not update wishlist', 'error'),
  });

  const toneClass = inWishlist ? 'text-red-500' : variant === 'overlay' ? 'text-white/90 hover:text-white' : 'text-ink-muted hover:text-ink';
  const scrimClass = variant === 'overlay' ? 'bg-black/40 hover:bg-black/55' : '';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      className={`rounded-full p-1.5 backdrop-blur-sm ${scrimClass} ${toneClass} ${className}`}
    >
      <HeartIcon filled={inWishlist} className="h-4 w-4" />
    </button>
  );
}
