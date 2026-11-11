import { useEffect, useState, type FormEvent } from 'react';
import { CreditCard, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { getApiErrorMessage } from '@/lib/api';
import { listPaymentAccounts, savePaymentAccount, type PaymentAccount, type PaymentAccountKind } from '@/lib/adminApi';

const KIND_OPTIONS: { value: PaymentAccountKind; label: string }[] = [
  { value: 'etisalat_cash', label: 'اتصالات كاش' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'bank', label: 'حساب بنكي' },
  { value: 'other', label: 'أخرى' },
];

type FormState = {
  id: string | null;
  kind: PaymentAccountKind;
  label: string;
  accountNumber: string;
  holderName: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  id: null,
  kind: 'bank',
  label: '',
  accountNumber: '',
  holderName: '',
  isActive: true,
};

export function PaymentSettingsTab() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    listPaymentAccounts({ includeInactive: true })
      .then((rows) => {
        setAccounts(rows);
        setLoadError('');
      })
      .catch(() => setLoadError('تعذر تحميل بيانات الحسابات'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => {
    setFormError('');
    setForm(emptyForm);
  };

  const openEdit = (account: PaymentAccount) => {
    setFormError('');
    setForm({
      id: account.id,
      kind: account.kind,
      label: account.label,
      accountNumber: account.accountNumber,
      holderName: account.holderName,
      isActive: account.isActive,
    });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setFormError('');
    try {
      await savePaymentAccount({
        id: form.id,
        kind: form.kind,
        label: form.label.trim(),
        accountNumber: form.accountNumber.trim(),
        holderName: form.holderName.trim(),
        isActive: form.isActive,
      });
      setForm(null);
      load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'تعذر حفظ الحساب، حاول مرة أخرى'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-brand-400" />
          <h2 className="font-bold">حسابات الدفع</h2>
        </div>
        <Button variant="primary" size="sm" onClick={openNew}>
          <span className="flex items-center gap-1">
            <Plus size={16} /> إضافة
          </span>
        </Button>
      </div>

      {loading && accounts.length === 0 && <p className="py-6 text-center text-sm text-navy-400">جاري التحميل...</p>}
      {loadError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{loadError}</p>}

      {accounts.map((account) => (
        <div key={account.id} className="rounded-2xl bg-navy-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-white">{account.label}</p>
              <p dir="ltr" className="text-right font-mono text-sm text-navy-200">{account.accountNumber}</p>
              {account.holderName && <p className="text-xs text-navy-400">{account.holderName}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  account.isActive ? 'bg-success-500/20 text-success-400' : 'bg-navy-700 text-navy-300'
                }`}
              >
                {account.isActive ? 'مفعّل' : 'موقوف'}
              </span>
              <button
                type="button"
                onClick={() => openEdit(account)}
                className="flex items-center gap-1 rounded-lg bg-navy-700 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-navy-600 active:scale-95"
              >
                <Pencil size={12} /> تعديل
              </button>
            </div>
          </div>
        </div>
      ))}

      {form && (
        <form onSubmit={handleSave} className="space-y-3 rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-navy-900">{form.id ? 'تعديل الحساب' : 'حساب جديد'}</h3>
            <button type="button" onClick={() => setForm(null)} className="text-navy-500 hover:text-navy-900">
              <X size={18} />
            </button>
          </div>
          <SelectField
            label="نوع الحساب"
            value={form.kind}
            onChange={(value) => setForm({ ...form, kind: value as PaymentAccountKind })}
            options={KIND_OPTIONS}
          />
          <TextField
            label="الاسم الظاهر للكابتن"
            placeholder="مثال: اتصالات كاش"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <TextField
            label="رقم الحساب أو المحفظة"
            dir="ltr"
            placeholder="01000000000"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          />
          <TextField
            label="اسم صاحب الحساب (اختياري)"
            value={form.holderName}
            onChange={(e) => setForm({ ...form, holderName: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 accent-brand-500"
            />
            ظاهر للكباتن
          </label>
          {formError && <p className="rounded-lg bg-error-50 p-2.5 text-sm text-error-600">{formError}</p>}
          <Button type="submit" variant="primary" size="md" fullWidth disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        </form>
      )}
    </div>
  );
}
