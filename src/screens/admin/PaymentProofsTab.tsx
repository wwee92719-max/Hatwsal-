import { useEffect, useState } from 'react';
import { Check, Clock, Eye, Image as ImageIcon, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  getPaymentProofScreenshotUrl,
  listPaymentProofs,
  reviewPaymentProof,
  type PaymentProof,
  type PaymentProofStatus,
} from '@/lib/adminApi';

const FILTERS: { value: PaymentProofStatus; label: string }[] = [
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'approved', label: 'معتمدة' },
  { value: 'rejected', label: 'مرفوضة' },
];

export function PaymentProofsTab() {
  const [filter, setFilter] = useState<PaymentProofStatus>('pending');
  const [version, setVersion] = useState(0);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPaymentProofs({ status: filter })
      .then((rows) => {
        if (!active) return;
        setProofs(rows);
        setLoadError('');
      })
      .catch(() => {
        if (active) setLoadError('تعذر تحميل التحويلات');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, version]);

  const reload = () => setVersion((v) => v + 1);

  const showScreenshot = async (proof: PaymentProof) => {
    setOpeningId(proof.id);
    setActionError('');
    try {
      const url = await getPaymentProofScreenshotUrl(proof.screenshotPath);
      setScreenshots((prev) => ({ ...prev, [proof.id]: url }));
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'تعذر فتح الصورة'));
    } finally {
      setOpeningId(null);
    }
  };

  const review = async (proof: PaymentProof, decision: 'approve' | 'reject') => {
    setBusyId(proof.id);
    setActionError('');
    try {
      await reviewPaymentProof(proof.id, decision);
      reload();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'تعذر تنفيذ الإجراء، حاول مرة أخرى'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Wallet size={20} className="text-brand-400" />
        <h2 className="font-bold">تحويلات الكباتن</h2>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
              filter === f.value ? 'bg-brand-500 text-white' : 'bg-navy-800 text-navy-300 hover:bg-navy-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{actionError}</p>}
      {loading && <p className="py-6 text-center text-sm text-navy-400">جاري التحميل...</p>}
      {loadError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{loadError}</p>}

      {!loading && !loadError && proofs.length === 0 && (
        <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
          <Clock className="mx-auto mb-2" size={32} />
          <p>لا توجد تحويلات في هذا القسم</p>
        </div>
      )}

      {proofs.map((proof) => {
        const screenshot = screenshots[proof.id];
        const isPending = proof.status === 'pending';
        return (
          <div key={proof.id} className="space-y-3 rounded-2xl bg-navy-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white">{proof.driverName}</p>
                <p className="text-xs text-navy-400">{proof.accountLabel} · {formatDateTime(proof.createdAt)}</p>
              </div>
              <p className="shrink-0 text-lg font-extrabold text-brand-400">{formatMoney(proof.amount)}</p>
            </div>

            {screenshot ? (
              <img
                src={screenshot}
                alt="صورة التحويل"
                className="max-h-96 w-full rounded-xl bg-navy-900 object-contain"
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                disabled={openingId === proof.id}
                onClick={() => showScreenshot(proof)}
              >
                <span className="flex items-center justify-center gap-1">
                  <Eye size={16} /> {openingId === proof.id ? 'جاري فتح الصورة...' : 'عرض صورة التحويل'}
                </span>
              </Button>
            )}

            {isPending ? (
              <div className="flex gap-2">
                <Button variant="success" size="sm" fullWidth disabled={busyId === proof.id} onClick={() => review(proof, 'approve')}>
                  <span className="flex items-center justify-center gap-1">
                    <Check size={16} /> اعتماد وإضافة للمحفظة
                  </span>
                </Button>
                <Button variant="danger" size="sm" fullWidth disabled={busyId === proof.id} onClick={() => review(proof, 'reject')}>
                  <span className="flex items-center justify-center gap-1">
                    <X size={16} /> رفض
                  </span>
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-1 text-xs text-navy-400">
                <ImageIcon size={12} />
                {proof.reviewedAt ? `تمت المراجعة ${formatDateTime(proof.reviewedAt)}` : 'تمت المراجعة'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
