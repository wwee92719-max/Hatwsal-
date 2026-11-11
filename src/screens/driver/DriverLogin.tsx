import { useState } from 'react';
import { Clock, Phone, ShieldAlert, Search } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { findDriverByPhone, getApiErrorMessage, type Driver } from '@/lib/api';

type Props = { onLogin: (driver: Driver) => void };

export function DriverLogin({ onLogin }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDriver, setPendingDriver] = useState<Driver | null>(null);

  const handleLogin = async () => {
    const trimmed = phone.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    setPendingDriver(null);
    try {
      const driver = await findDriverByPhone(trimmed);
      if (!driver) {
        setError('هذا الرقم غير مسجل، سجل كابتن جديد من تبويب التسجيل');
        return;
      }
      if (driver.status === 'approved') {
        onLogin(driver);
        return;
      }
      setPendingDriver(driver);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تسجيل الدخول، تأكد من الاتصال وحاول مرة أخرى'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-1 font-bold text-navy-800">تسجيل الدخول</h3>
        <p className="mb-4 text-sm text-navy-500">ادخل برقم التليفون المسجل لتشوف محفظتك ورحلاتك</p>
        <div className="space-y-4">
          <TextField
            label="رقم التليفون"
            placeholder="01xxxxxxxxx"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            icon={<Phone size={18} />}
          />
          <Button variant="primary" size="lg" fullWidth disabled={!phone.trim() || loading} onClick={handleLogin}>
            <span className="flex items-center justify-center gap-2">
              <Search size={20} />
              {loading ? 'جاري التحقق...' : 'دخول'}
            </span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-error-50 px-4 py-3 text-center text-sm font-semibold text-error-600">{error}</div>
      )}

      {pendingDriver && pendingDriver.status === 'pending' && (
        <div className="flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow-sm animate-scale-in">
          <Clock className="mb-3 text-warning-500" size={40} />
          <p className="font-bold text-navy-800">طلبك قيد المراجعة</p>
          <p className="mt-1 text-sm text-navy-500">لم تتم الموافقة على حسابك بعد، سيظهر لوحة المحفظة فور اعتماده</p>
        </div>
      )}

      {pendingDriver && pendingDriver.status === 'rejected' && (
        <div className="flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow-sm animate-scale-in">
          <ShieldAlert className="mb-3 text-error-500" size={40} />
          <p className="font-bold text-navy-800">تم رفض طلبك</p>
          <p className="mt-1 text-sm text-navy-500">تواصل مع الدعم الفني لمزيد من المعلومات</p>
        </div>
      )}
    </div>
  );
}
