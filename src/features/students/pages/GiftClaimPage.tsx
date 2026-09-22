import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkoutApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { errorText } from '@/lib/errorMessages';
import { Logo } from '@/components/brand/Logo';
import { Spinner } from '@/components/common/Spinner';

const ITEM_TYPE_HOME: Record<string, string> = {
  quiz: '/home',
  practiceTest: '/home/practice-tests',
  course: '/home/courses',
  package: '/home/purchases',
};

// Public "you've been gifted a course" landing page - reachable without
// signing in (getGift is a public action, see api/checkout.ts) so the
// recipient can see who sent it and what it is before deciding to sign in.
// Claiming itself (claimGift) requires a signed-in account whose email
// matches the gift's recipientEmail exactly - see that function's own
// comment for why.
export function GiftClaimPage() {
  const { claimCode } = useParams<{ claimCode: string }>();
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const queryClient = useQueryClient();
  const [claimedItem, setClaimedItem] = useState<{ itemType: string; itemId: string; itemTitle: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public', 'gift', claimCode],
    queryFn: () => checkoutApi.getGift(claimCode!),
    enabled: !!claimCode,
    retry: false,
  });

  const claim = useMutation({
    mutationFn: () => checkoutApi.claimGift(claimCode!),
    onSuccess: (result) => {
      setClaimedItem(result);
      queryClient.invalidateQueries({ queryKey: ['student', 'purchases'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'certificationCatalog'] });
    },
  });

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        {(isLoading || isInitializing) && <p className="text-center text-ink-faint">Loading your gift…</p>}

        {!isLoading && error && (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
            <h1 className="mb-2 text-lg font-bold text-ink">Gift Link Not Found</h1>
            <p className="text-sm text-ink-faint">
              This gift link is invalid, or the gift has already been claimed. Double-check the link, or ask the sender
              to resend it.
            </p>
          </div>
        )}

        {!isLoading && data && !claimedItem && (
          <div className="rounded-xl border border-brand-500/30 bg-surface-raised p-8 text-center">
            <div className="mb-3 text-4xl" aria-hidden="true">
              🎁
            </div>
            <h1 className="mb-1 text-xl font-bold text-ink">
              {data.buyerName} sent you a gift{data.recipientName ? `, ${data.recipientName}` : ''}!
            </h1>
            <p className="mb-4 text-lg font-semibold text-brand-ink">{data.itemTitle}</p>
            {data.message && (
              <p className="mb-4 rounded-lg border border-surface-border bg-surface p-3 text-sm italic text-ink-muted">
                &ldquo;{data.message}&rdquo;
              </p>
            )}

            {data.status === 'claimed' ? (
              <p className="text-sm font-semibold text-warning">This gift has already been claimed.</p>
            ) : data.status === 'cancelled' ? (
              <p className="text-sm font-semibold text-danger">This gift was cancelled by the sender.</p>
            ) : data.expired ? (
              <p className="text-sm font-semibold text-danger">This gift link has expired.</p>
            ) : data.status === 'scheduled' ? (
              <p className="text-sm text-ink-faint">This gift hasn&rsquo;t been sent yet - check back soon.</p>
            ) : !profile ? (
              <div className="space-y-2">
                <p className="mb-2 text-sm text-ink-faint">Sign in or create an account to claim this gift.</p>
                <Link
                  to="/login"
                  className="block w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="block w-full rounded-lg border border-brand-500 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-50"
                >
                  Create Account
                </Link>
                <p className="mt-2 text-xs text-ink-faint">Come back to this link once you&rsquo;re signed in to claim it.</p>
              </div>
            ) : (
              <div>
                {claim.isError && (
                  <p className="mb-3 text-sm font-medium text-danger">{errorText(claim.error, 'Could not claim this gift')}</p>
                )}
                <button
                  type="button"
                  disabled={claim.isPending}
                  onClick={() => claim.mutate()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {claim.isPending && <Spinner className="h-4 w-4" />}
                  {claim.isPending ? 'Claiming…' : 'Claim This Gift'}
                </button>
                <p className="mt-2 text-xs text-ink-faint">Signed in as {profile.email}.</p>
              </div>
            )}
          </div>
        )}

        {claimedItem && (
          <div className="rounded-xl border border-emerald-500/30 bg-surface-raised p-8 text-center">
            <div className="mb-3 text-4xl" aria-hidden="true">
              🎉
            </div>
            <h1 className="mb-2 text-xl font-bold text-ink">It&rsquo;s yours!</h1>
            <p className="mb-5 text-sm text-ink-faint">{claimedItem.itemTitle} is now unlocked on your account.</p>
            <Link
              to={ITEM_TYPE_HOME[claimedItem.itemType] ?? '/home'}
              className="block w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Start Learning →
            </Link>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-brand-ink hover:underline">
            ← Back to HelpCertify
          </Link>
        </div>
      </div>
    </div>
  );
}
