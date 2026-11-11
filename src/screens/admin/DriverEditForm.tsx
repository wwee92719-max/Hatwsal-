import { useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { getApiErrorMessage, type Driver } from '@/lib/api';
import { updateDriver } from '@/lib/adminApi';

type Props = {
  driver: Driver;
  onSaved: () => void;
  onCancel: () => void;
};

export function DriverEditForm({ driver, onSaved, onCancel }: Props) {
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone);
  const [address, setAddress] = useState(driver.address);
  const [vehicleType, setVehicleType] = useState(driver.vehicleType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await updateDriver({ driverId: driver.id, name, phone, address, vehicleType });
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ بيانات الكابتن'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-xl bg-white p-3">
      <TextField label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="رقم الهاتف"
        dir="ltr"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <TextField label="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} />
      <TextField label="نوع المركبة" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
      {error && <p className="rounded-lg bg-error-500/20 p-2.5 text-sm text-error-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" fullWidth onClick={onCancel} disabled={saving}>
          <span className="flex items-center justify-center gap-1">
            <X size={16} /> إلغاء
          </span>
        </Button>
        <Button type="submit" variant="primary" size="sm" fullWidth disabled={saving}>
          <span className="flex items-center justify-center gap-1">
            <Check size={16} /> {saving ? 'جاري الحفظ...' : 'حفظ'}
          </span>
        </Button>
      </div>
    </form>
  );
}
