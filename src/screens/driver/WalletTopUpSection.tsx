import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/api';
import {
  listPaymentAccounts,
  listPaymentProofs,
  submitPaymentProof,
  type PaymentAccount,
  type PaymentProof,
} from '@/lib/adminApi';

const STATUS_BADGE: Record<PaymentProof['status'], { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: 'قيد المراجعة', className: 'bg-warning-50 text-warning-600', icon: Clock },
  approved: { label: 'تم الاعتماد', className: 'bg-success-50 text-success-600', icon: CheckCircle2 },
  rejected: { label: 'مرفوض', className: 'bg-error-50 text-error-600', icon: XCircle },
};

type Props = { driverId: string };

export function WalletTopUpSection({ driverId }: Props) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadProofs = () => {
    listPaymentProofs({ driverId })
      .then(setProofs)
      .catch(() => setLoadError('تعذر تحميل تحويلاتك السابقة'));
  };

  useEffect(() => {
    listPaymentAccounts()
      .then(setAccounts)
      .catch(() => setLoadError('تعذر تحميل حسابات الدفع'));
    loadProofs();
  }, [driverId]);

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.holderName ? `${a.label} - ${a.accountNumber} (${a.holderName})` : `${a.label} - ${a.accountNumber}`,
  }));
  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const value = Number(amount);
    if (!accountId) {
      setNotice({ type: 'error', text: 'اختر الحساب الذي حولت عليه' });
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setNotice({ type: 'error', text: 'اكتب المبلغ المحول' });
      return;
    }
    if (!file) {
      setNotice({ type: 'error', text: 'اختر صورة التحويل أولاً' });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await submitPaymentProof({ driverId, paymentAccountId: accountId, amount: value, file });
      setNotice({ type: 'success', text: 'تم إرسال التحويل للمراجعة، هيتم إضافة المبلغ للمحفظة بعد الاعتماد' });
      setAmount('');
      setFile(null);
      loadProofs();
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'تعذر إرسال التحويل، حاول مرة أخرى') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-bold text-navy-800">شحن المحفظة بتحويل</h3>

      {accounts.length === 0 ? (
        <p className="py-2 text-center text-sm text-navy-400">لا توجد حسابات دفع متاحة حالياً</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <SelectField
            label="حوّل على"
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            placeholder="اختر الحساب"
          />
          {selectedAccount && (
            <p dir="ltr" className="rounded-lg bg-brand-50 p-2.5 text-center font-mono text-sm font-semibold text-brand-700">
              {selectedAccount.accountNumber}
            </p>
          )}
          <TextField
            label="المبلغ (جنيه)"
            type="number"
            min="1"
            step="0.01"
            placeholder="اكتب المبلغ المحول"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <ImageUploadField label="الرسيت بتاع المحفظة" value={file} onChange={setFile} disabled={submitting} />
          <Button type="submit" variant="primary" size="md" fullWidth disabled={submitting}>
            {submitting ? 'جاري الإرسال...' : 'إرسال للمراجعة'}
          </Button>
        </form>
      )}

      {notice && (
        <p className={`rounded-xl p-3 text-sm font-semibold ${notice.type === 'success' ? 'bg-success-50 text-success-600' : 'bg-error-50 text-error-600'}`}>
          {notice.text}
        </p>
      )}
      {loadError && <p className="text-sm text-error-600">{loadError}</p>}

      {proofs.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-navy-700">تحويلاتك</p>
          {proofs.map((proof) => {
            const badge = STATUS_BADGE[proof.status];
            const Icon = badge.icon;
            return (
              <div key={proof.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-800">{formatMoney(proof.amount)} · {proof.accountLabel}</p>
                  <p className="text-xs text-navy-400">{formatDateTime(proof.createdAt)}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                  <Icon size={12} /> {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
