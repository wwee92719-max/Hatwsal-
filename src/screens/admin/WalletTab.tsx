import { useEffect, useState, type FormEvent } from 'react';
import { Wallet, Banknote, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { getApiErrorMessage, hasActiveSubscription, listCompletedTripsSince, listWalletTransactions, topUpWallet, type Driver, type WalletTransaction } from '@/lib/api';
import { formatDateTime, formatMoney, startOfCurrentMonthIso } from '@/lib/format';

type Props = {
  drivers: Driver[];
  onChanged: () => void;
};

export function WalletTab({ drivers, onChanged }: Props) {
  const [ledger, setLedger] = useState<WalletTransaction[]>([]);
  const [monthlyEarnings, setMonthlyEarnings] = useState(0);
  const [driverId, setDriverId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadLedger = () => {
    listWalletTransactions({ limit: 200 })
      .then(setLedger)
      .catch(() => setMessage({ type: 'error', text: 'تعذر تحميل سجل المحفظة' }));
    listCompletedTripsSince(startOfCurrentMonthIso())
      .then((rows) => setMonthlyEarnings(rows.reduce((sum, r) => sum + r.driverEarning, 0)))
      .catch(() => setMonthlyEarnings(0));
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const monthStart = startOfCurrentMonthIso();
  const monthlySubscriptions = ledger
    .filter((row) => row.kind === 'subscription' && row.createdAt >= monthStart)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);

  const driverOptions = drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.phone})` }));

  const handleTopUp = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!driverId || !Number.isFinite(value) || value <= 0 || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const balance = await topUpWallet(driverId, value, note.trim());
      setMessage({ type: 'success', text: `تم شحن المحفظة، الرصيد الجديد ${formatMoney(balance)}` });
      setAmount('');
      setNote('');
      onChanged();
      loadLedger();
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'تعذر شحن المحفظة') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Wallet size={20} className="text-brand-400" />
        <h2 className="font-bold">المحافظ والاشتراكات</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-4">
          <p className="text-lg font-extrabold text-white">{formatMoney(monthlySubscriptions)}</p>
          <p className="text-xs text-white/80">إيرادات الاشتراكات هذا الشهر</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-navy-600 to-navy-700 p-4">
          <p className="text-lg font-extrabold text-white">{formatMoney(monthlyEarnings)}</p>
          <p className="text-xs text-white/80">أرباح الكباتن هذا الشهر</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="font-bold text-navy-800">أرصدة الكباتن</h3>
        </div>
        {drivers.length === 0 && <p className="py-4 text-center text-sm text-navy-400">لا يوجد كباتن</p>}
        {drivers.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-navy-500">
                <th className="px-4 py-2 text-right font-semibold">الكابتن</th>
                <th className="px-4 py-2 text-center font-semibold">الرصيد</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-navy-800">{d.name}</p>
                    <p dir="ltr" className="text-right text-xs text-navy-400">{d.phone}</p>
                  </td>
                  <td className={`px-4 py-2.5 text-center font-bold ${hasActiveSubscription(d) ? 'text-success-600' : 'text-error-600'}`}>
                    {formatMoney(d.walletBalance)}
                    <p className="text-xs font-normal text-navy-400">{hasActiveSubscription(d) ? 'الاشتراك فعال' : 'الاشتراك منتهي'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => setDriverId(d.id)}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-brand-600 active:scale-95"
                    >
                      شحن
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={handleTopUp} className="space-y-3 rounded-2xl bg-navy-800 p-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <Banknote size={18} className="text-brand-400" /> شحن محفظة كابتن (كاش)
        </h3>
        <SelectField
          label="الكابتن"
          value={driverId}
          onChange={setDriverId}
          options={driverOptions}
          placeholder="اختر الكابتن"
        />
        <TextField
          label="المبلغ (جنيه)"
          type="number"
          min="1"
          step="0.01"
          placeholder="اكتب المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="ملاحظة"
          placeholder="مثال: استلام كاش من الكابتن"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          disabled={!driverId || !amount || submitting}
        >
          {submitting ? 'جاري الشحن...' : 'شحن المحفظة'}
        </Button>
        {message && (
          <p className={`rounded-lg p-2.5 text-sm ${message.type === 'success' ? 'bg-success-500/20 text-success-400' : 'bg-error-500/20 text-error-400'}`}>
            {message.text}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-bold text-white/90">
          <Receipt size={18} className="text-brand-400" /> سجل الحركات
        </h3>
        {ledger.length === 0 && <p className="py-4 text-center text-sm text-navy-400">لا توجد حركات بعد</p>}
        {ledger.map((row) => {
          const isTopup = row.kind === 'topup';
          return (
            <div key={row.id} className="rounded-xl bg-navy-800 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{row.driverName}</p>
                  <p className="text-xs text-navy-400">
                    {isTopup ? 'شحن كاش' : ledgerLabel(row.kind)}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                  <p className="text-xs text-navy-500">{formatDateTime(row.createdAt)}</p>
                </div>
                <div className="text-left">
                  <p className={`font-bold ${isTopup ? 'text-success-400' : 'text-error-400'}`}>
                    {isTopup ? '+' : '-'}
                    {formatMoney(Math.abs(row.amount))}
                  </p>
                  <p className="text-xs text-navy-400">الرصيد: {formatMoney(row.balanceAfter)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ledgerLabel(kind: WalletTransaction['kind']): string {
  if (kind === 'subscription') return 'اشتراك شهري';
  if (kind === 'discount_compensation') return 'تعويض خصم عميل جديد';
  return 'عمولة (قبل تطبيق الاشتراك)';
}
