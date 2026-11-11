import { useState } from 'react';
import { Check, CheckCircle2, Clock, IdCard, Truck, User, MapPin, Phone } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { vehicleTypes } from '@/data/vehicles';
import { registerDriver, getApiErrorMessage } from '@/lib/api';

export function DriverRegisterForm() {
  const { setScreen } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const vehicleOptions = vehicleTypes.map((v) => ({ value: v.name, label: v.name }));

  const canSubmit = name.trim() && phone.trim() && address.trim() && vehicleType && agreed && idFront && idBack;

  const handleSubmit = async () => {
    if (!idFront || !idBack || !canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await registerDriver({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        vehicleType,
        idFront,
        idBack,
      });
      setSubmitted(true);
    } catch (err) {
      const duplicate = err instanceof Error && err.message === 'phone_taken';
      setError(duplicate ? 'هذا الرقم مسجل بالفعل، سجل دخولك بدلاً من ذلك' : getApiErrorMessage(err, 'تعذر إرسال الطلب، حاول مرة أخرى'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 animate-scale-in">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-warning-500 shadow-xl shadow-warning-500/30">
          <Clock className="text-white" size={48} />
        </div>
        <h2 className="mt-6 text-2xl font-extrabold text-navy-800">تم إرسال طلبك</h2>
        <p className="mt-2 text-center text-navy-500">طلبك قيد المراجعة من الإدارة</p>
        <div className="mt-4 rounded-xl bg-warning-50 px-6 py-2">
          <span className="font-bold text-warning-600">في انتظار الموافقة</span>
        </div>
        <Button variant="secondary" size="lg" className="mt-8" onClick={() => setScreen('role')}>
          العودة للرئيسية
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
          <User size={20} className="text-brand-500" />
          بيانات الكابتن
        </h3>
        <div className="space-y-3">
          <TextField
            label="الاسم"
            placeholder="اكتب اسمك"
            value={name}
            onChange={(e) => setName(e.target.value)}
            icon={<User size={18} />}
          />
          <TextField
            label="رقم التليفون"
            placeholder="01xxxxxxxxx"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            icon={<Phone size={18} />}
          />
          <TextField
            label="العنوان"
            placeholder="اكتب عنوانك"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            icon={<MapPin size={18} />}
          />
          <SelectField
            label="نوع المركبة"
            value={vehicleType}
            onChange={setVehicleType}
            options={vehicleOptions}
            placeholder="اختر نوع المركبة"
            icon={<Truck size={18} />}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-bold text-navy-800">
          <IdCard size={20} className="text-brand-500" />
          صورة البطاقة
        </h3>
        <ImageUploadField
          label="صورة البطاقة وش"
          value={idFront}
          onChange={setIdFront}
          capture="environment"
          disabled={submitting}
        />
        <ImageUploadField
          label="صورة البطاقة ظهر"
          value={idBack}
          onChange={setIdBack}
          capture="environment"
          disabled={submitting}
        />
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <button
            type="button"
            onClick={() => setAgreed(!agreed)}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
              agreed ? 'border-brand-500 bg-brand-500' : 'border-gray-300 bg-white'
            }`}
          >
            {agreed && <Check className="text-white" size={16} />}
          </button>
          <span className="text-sm font-semibold text-navy-700">موافقة على العمل في التطبيق</span>
        </label>
      </div>

      {error && (
        <div className="rounded-xl bg-error-50 px-4 py-3 text-center text-sm font-semibold text-error-600">{error}</div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className={canSubmit ? '' : 'cursor-not-allowed opacity-50'}
      >
        <span className="flex items-center justify-center gap-2">
          <CheckCircle2 size={22} />
          {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
        </span>
      </Button>

      {!canSubmit && (
        <p className="text-center text-sm text-navy-400">
          يرجى ملء جميع الحقول ورفع صور البطاقة والموافقة على الشروط
        </p>
      )}
    </div>
  );
}
