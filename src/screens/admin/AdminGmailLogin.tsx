import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { requestAdminCode, verifyAdminCode } from '@/lib/adminApi';
import { isValidEmail, normalizeEmail } from '@/lib/adminAccess';

const REQUEST_ERRORS: Record<string, string> = {
  invalid: 'يرجى كتابة بريد إلكتروني صحيح',
  not_added: 'هذا البريد غير مضاف كمدير في التطبيق',
  rate_limited: 'تم إرسال كود منذ قليل، انتظر دقيقة ثم حاول مرة أخرى',
  failed: 'تعذر إرسال الكود، حاول مرة أخرى',
};

export function AdminGmailLogin() {
  const { setScreen } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const sendCode = async (address: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await requestAdminCode(address);
    setBusy(false);
    if (result === 'sent') {
      setEmail(address);
      setCode('');
      setStep('code');
      setNotice('تم إرسال كود التحقق إلى بريدك');
      return;
    }
    setError(REQUEST_ERRORS[result] ?? REQUEST_ERRORS.failed);
  };

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError(REQUEST_ERRORS.invalid);
      return;
    }
    void sendCode(normalized);
  };

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const ok = await verifyAdminCode(email, code.trim());
    setBusy(false);
    if (!ok) setError('الكود غير صحيح أو منتهي، حاول مرة أخرى');
  };

  return (
    <div className="min-h-screen bg-navy-950 px-6 py-8">
      <button
        onClick={() => setScreen('role')}
        className="mb-8 flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white"
      >
        <ArrowRight size={18} />
        <span>رجوع</span>
      </button>

      <div className="mx-auto max-w-sm animate-slide-up">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-xl shadow-brand-500/40">
              <ShieldCheck className="text-white" size={28} />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-white">دخول الإدارة</h1>
          <p className="mt-1 text-sm text-navy-300">
            {step === 'email' ? 'اكتب بريد المدير المسجل لإرسال كود التحقق' : `اكتب الكود المرسل إلى ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <TextField
              label="بريد المدير (Gmail)"
              dir="ltr"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
            />
            {error && <p className="rounded-lg bg-error-50 p-2.5 text-sm text-error-600">{error}</p>}
            <Button type="submit" variant="primary" size="md" fullWidth disabled={busy || email.trim() === ''}>
              <span className="flex items-center justify-center gap-1">
                <Mail size={18} /> {busy ? 'جاري الإرسال...' : 'إرسال الكود'}
              </span>
            </Button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <TextField
              label="كود التحقق (6 أرقام)"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              icon={<KeyRound size={18} />}
            />
            {notice && !error && <p className="rounded-lg bg-success-50 p-2.5 text-sm text-success-600">{notice}</p>}
            {error && <p className="rounded-lg bg-error-50 p-2.5 text-sm text-error-600">{error}</p>}
            <Button type="submit" variant="primary" size="md" fullWidth disabled={busy || code.length !== 6}>
              {busy ? 'جاري التحقق...' : 'دخول'}
            </Button>
            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError('');
                  setNotice('');
                }}
                className="font-semibold text-navy-600 hover:text-navy-900"
              >
                تغيير البريد
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendCode(email)}
                className="font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                إعادة إرسال الكود
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
