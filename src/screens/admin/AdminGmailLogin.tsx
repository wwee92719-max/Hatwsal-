import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { signInAdmin } from '@/lib/adminApi';
import { isValidEmail, normalizeEmail } from '@/lib/adminAccess';

const ERROR_MESSAGES: Record<string, string> = {
  not_admin: 'هذا البريد غير مضاف كمدير في التطبيق',
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  default: 'تعذر تسجيل الدخول، تحقق من البريد وكلمة المرور وحاول مرة أخرى',
};

const mapError = (error?: string): string => {
  if (!error) return ERROR_MESSAGES.default;
  if (error === 'not_admin') return ERROR_MESSAGES.not_admin;
  if (/invalid|credentials|password/i.test(error)) return ERROR_MESSAGES.invalid_credentials;
  return ERROR_MESSAGES.default;
};

export function AdminGmailLogin() {
  const { setScreen } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError('يرجى كتابة بريد إلكتروني صحيح');
      return;
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    setBusy(true);
    setError('');
    const result = await signInAdmin(normalized, password);
    setBusy(false);
    if (!result.ok) setError(mapError(result.error));
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
          <p className="mt-1 text-sm text-navy-300">اكتب بريد المدير وكلمة المرور للدخول</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
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
          <TextField
            label="كلمة المرور"
            dir="ltr"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<KeyRound size={18} />}
          />
          {error && <p className="rounded-lg bg-error-50 p-2.5 text-sm text-error-600">{error}</p>}
          <Button type="submit" variant="primary" size="md" fullWidth disabled={busy || email.trim() === '' || password === ''}>
            <span className="flex items-center justify-center gap-1">
              <ShieldCheck size={18} /> {busy ? 'جاري الدخول...' : 'دخول'}
            </span>
          </Button>
        </form>
      </div>
    </div>
  );
}
