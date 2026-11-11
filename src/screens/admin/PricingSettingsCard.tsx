import { useEffect, useState, type FormEvent } from 'react';
import { Calculator, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { DEFAULT_PRICING, type PricingSettings } from '@/lib/pricing';
import { getPricingSettings, savePricingSettings } from '@/lib/appSettings';
import { getApiErrorMessage } from '@/lib/api';

export function PricingSettingsCard() {
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getPricingSettings()
      .then(setSettings)
      .catch(() => setMessage({ type: 'error', text: 'تعذر تحميل إعدادات الأسعار' }))
      .finally(() => setLoaded(true));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await savePricingSettings(settings);
      setMessage({ type: 'success', text: 'تم حفظ إعدادات الأسعار' });
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'تعذر حفظ الإعدادات') });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof PricingSettings, value: string) => {
    const num = parseFloat(value);
    setSettings((prev) => ({ ...prev, [key]: Number.isFinite(num) && num >= 0 ? num : 0 }));
  };

  return (
    <div className="space-y-3 rounded-2xl bg-navy-800 p-4">
      <div className="flex items-center gap-2 text-white">
        <Calculator size={18} className="text-brand-400" />
        <h2 className="font-bold">إعدادات حساب المشوار</h2>
      </div>

      {!loaded ? (
        <p className="py-2 text-center text-sm text-navy-400">جاري التحميل...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <TextField
            label="فتحة العداد (جنيه)"
            type="number"
            step="0.5"
            min="0"
            placeholder="15"
            value={String(settings.baseFare)}
            onChange={(e) => updateField('baseFare', e.target.value)}
          />
          <TextField
            label="سعر الكيلومتر (جنيه)"
            type="number"
            step="0.5"
            min="0"
            placeholder="3"
            value={String(settings.perKm)}
            onChange={(e) => updateField('perKm', e.target.value)}
          />
          <TextField
            label="سعر الدقيقة (جنيه)"
            type="number"
            step="0.1"
            min="0"
            placeholder="0.5"
            value={String(settings.perMinute)}
            onChange={(e) => updateField('perMinute', e.target.value)}
          />
          <TextField
            label="الحد الأدنى للمشوار (جنيه)"
            type="number"
            step="1"
            min="0"
            placeholder="20"
            value={String(settings.minimumFare)}
            onChange={(e) => updateField('minimumFare', e.target.value)}
          />
          {message && (
            <p
              className={`rounded-lg p-2.5 text-sm ${
                message.type === 'success' ? 'bg-success-500/20 text-success-400' : 'bg-error-500/20 text-error-400'
              }`}
            >
              {message.text}
            </p>
          )}
          <Button type="submit" variant="primary" size="md" fullWidth disabled={saving}>
            <span className="flex items-center justify-center gap-2">
              <Save size={16} />
              {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </span>
          </Button>
        </form>
      )}
    </div>
  );
}
