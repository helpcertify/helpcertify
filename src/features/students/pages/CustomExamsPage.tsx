import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { cartApi } from '../api/cartApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { useCheckout } from '../hooks/useCheckout';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { uploadContentFile } from '@/features/admin/api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { customExamApi, listMyCustomExamSets } from '../api/customExamApi';

function useCustomExamBuilderSettings() {
  return useQuery({
    queryKey: ['customExamBuilder', 'settings'],
    // appSettings/customExamBuilder is publicly readable (see
    // firestore.rules) - read directly rather than through an authenticated
    // action, same reasoning as appSettings/company.
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'appSettings', 'customExamBuilder'));
      const data = snap.data();
      return {
        priceMinor: typeof data?.priceMinor === 'number' ? data.priceMinor : 49900,
        originalPriceMinor: typeof data?.originalPriceMinor === 'number' ? data.originalPriceMinor : null,
        currency: (data?.currency === 'USD' ? 'USD' : 'INR') as 'INR' | 'USD',
        isEnabled: data?.isEnabled !== false,
      };
    },
  });
}

// Custom Exam Builder ("Bring Your Own Question Bank"): buy the capability
// once, then upload and manage as many of your own question banks as you
// want. See src/features/marketing/pages/BuildYourOwnExamPage.tsx for the
// public-facing pitch and the sample-format explanation this page reuses.
export function CustomExamsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { checkout, paying, confirmation } = useCheckout();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showBuyNow, setShowBuyNow] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const { data: settings } = useCustomExamBuilderSettings();
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const owned = activePurchaseKeys(purchases?.purchases).has('customExamBuilder_capability');

  const { data: sets, isLoading: setsLoading } = useQuery({
    queryKey: ['student', 'customExamSets', uid],
    queryFn: () => listMyCustomExamSets(uid!),
    enabled: !!uid && owned,
  });

  const deleteMutation = useMutation({
    mutationFn: (setId: string) => customExamApi.delete(setId),
    onSuccess: () => {
      pushToast('Deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['student', 'customExamSets', uid] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not delete this question bank'), 'error'),
  });

  async function handleUpload() {
    if (!file) return;
    if (!title.trim()) {
      pushToast('Give your question bank a title first', 'error');
      return;
    }
    setUploading(true);
    try {
      const fileUrl = await uploadContentFile(file);
      const result = await customExamApi.create({ title: title.trim(), fileUrl });
      pushToast(
        `Uploaded: ${result.totalQuestions} question${result.totalQuestions === 1 ? '' : 's'} parsed.` +
          (result.parseWarnings.length > 0
            ? ` ${result.parseWarnings.length} question(s) had a formatting issue and may need review.`
            : ''),
        'success'
      );
      setTitle('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['student', 'customExamSets', uid] });
    } catch (err) {
      pushToast(errorText(err, 'Could not upload your question bank'), 'error');
    } finally {
      setUploading(false);
    }
  }

  const price = settings?.priceMinor ?? 49900;
  const originalPrice = settings?.originalPriceMinor ?? null;
  const hasOffer = !!originalPrice && originalPrice > price;
  const currency = settings?.currency ?? 'INR';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Custom Exam Builder</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Upload your own question bank for a certification HelpCertify doesn&apos;t stock, and take it
        as a private practice test or mock exam.
      </p>

      {!owned && (
        <div className="mt-6 rounded-xl border border-surface-border bg-surface-raised p-6">
          {settings && !settings.isEnabled ? (
            <p className="text-sm text-ink-muted">
              Custom Exam Builder isn&apos;t available for purchase right now. Check back later.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                {hasOffer && (
                  <span className="text-sm text-ink-faint line-through">{formatMoney(originalPrice, currency)}</span>
                )}
                <span className="text-lg font-bold text-ink">{formatMoney(price, currency)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                One-time purchase - unlocks uploading and managing as many of your own question banks as
                you want, no per-upload charge.
              </p>
              <button
                type="button"
                onClick={() => setShowBuyNow(true)}
                disabled={paying}
                className="mt-4 rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
              >
                Buy Custom Exam Builder - {formatMoney(price, currency)}
              </button>
            </>
          )}
        </div>
      )}

      {owned && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink">Upload a question bank</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadTemplate('standard')}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-400"
              >
                Download sample format (Standard)
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate('cisa_qa')}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-400"
              >
                Download sample format (Numbered Q&amp;A)
              </button>
            </div>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-ink-faint">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My CISA practice bank"
              className="input-dark mt-1 w-full"
            />

            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">
              Question bank (.docx)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-ink-muted"
            />

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !file}
              className="mt-4 rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-ink">Your question banks</h2>
            {setsLoading && <p className="text-sm text-ink-faint">Loading…</p>}
            {!setsLoading && (sets?.length ?? 0) === 0 && (
              <p className="text-sm text-ink-faint">Nothing uploaded yet.</p>
            )}
            <div className="space-y-3">
              {sets?.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-4"
                >
                  <div>
                    <div className="font-medium text-ink">{s.title}</div>
                    <div className="text-xs text-ink-faint">
                      {s.totalQuestions} question{s.totalQuestions === 1 ? '' : 's'}
                      {s.parseWarnings.length > 0 && ` · ${s.parseWarnings.length} warning(s)`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/custom-exams/${s.id}/take?mode=practice`}
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink hover:border-brand-400"
                    >
                      Practice
                    </Link>
                    <Link
                      to={`/custom-exams/${s.id}/take?mode=mock`}
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink hover:border-brand-400"
                    >
                      Mock exam
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: s.id, title: s.title })}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showBuyNow && (
        <BuyNowModal
          title="Custom Exam Builder"
          price={price}
          originalPrice={originalPrice}
          currency={currency}
          paying={paying}
          summaryItem={{ itemType: 'customExamBuilder', accessPeriodDays: 0 }}
          onClose={() => setShowBuyNow(false)}
          onConfirm={(consent, couponCode, useCredit) => {
            checkout({
              buyNowItem: { itemType: 'customExamBuilder', itemId: 'capability' },
              items: [{ itemType: 'customExamBuilder', itemId: 'capability', title: 'Custom Exam Builder' }],
              consent,
              couponCode,
              useCredit,
            });
            setShowBuyNow(false);
          }}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this question bank?"
        message={`"${pendingDelete?.title}" and its questions will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      {confirmation}
    </div>
  );
}
