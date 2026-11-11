import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { getSubscriptionPrice, saveSubscriptionPrice, SUBSCRIPTION_PRICE_DEFAULT } from '@/lib/appSettings';
import { getApiErrorMessage } from '@/lib/api';

export function SubscriptionPriceCard() {
  const [price, setPrice] = useState(String(SUBSCRIPTION_PRICE_DEFAULT));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getSubscriptionPrice()
      .then((value) => setPrice(String(value)))
      .catch(() => setMessage({ type: 'error', text: 'تعذر تحميل سعر الاشتراك' }))
      .finally(() => setLoaded(true));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(price);
    if (saving || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveSubscriptionPrice(value);
      setMessage({ type: 'success', text: 'تم حفظ سعر الاشتراك' });
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'تعذر حفظ سعر الاشتراك') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-navy-800 p-4">
      <div className="flex items-center gap-2 text-white">
        <CalendarClock size={18} className="text-brand-400" />
        <h2 className="font-bold">اشتراك الكباتن الشهري</h2>
      </div>

      {!loaded ? (
        <p className="py-2 text-center text-sm text-navy-400">جاري التحميل...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <TextField
            label="قيمة الاشتراك (جنيه) لمدة 30 يوم"
            type="number"
            step="1"
            min="1"
            placeholder="300"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <p className="text-xs text-navy-400">
            الكابتن يجدد اشتراكه من محفظته، ولا يستقبل طلبات العملاء إلا وهو مشترك.
          </p>
          {message && (
            <p
              className={`rounded-lg p-2.5 text-sm ${
                message.type === 'success' ? 'bg-success-500/20 text-success-400' : 'bg-error-500/20 text-error-400'
              }`}
            >
              {message.text}
            </p>
          )}
          <Button type="submit" variant="primary" size="md" fullWidth disabled={saving || !price}>
            <span className="flex items-center justify-center gap-2">
              <Save size={16} />
              {saving ? 'جاري الحفظ...' : 'حفظ سعر الاشتراك'}
            </span>
          </Button>
        </form>
      )}
    </div>
  );
}
