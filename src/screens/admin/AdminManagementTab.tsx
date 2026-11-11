import { useEffect, useState, type FormEvent } from 'react';
import { Mail, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAdminSession } from '@/context/AdminSessionContext';
import { getApiErrorMessage } from '@/lib/api';
import { addAdmin, listAdmins, removeAdmin, type AdminUser } from '@/lib/adminApi';
import { isValidEmail, normalizeEmail } from '@/lib/adminAccess';

export function AdminManagementTab() {
  const { adminEmail } = useAdminSession();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setAdmins(await listAdmins());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setFormError('يرجى كتابة بريد إلكتروني صحيح');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await addAdmin(normalized);
      setEmail('');
      await reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'تعذر إضافة المدير'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (admin: AdminUser) => {
    const confirmed = window.confirm(`إلغاء صلاحية ${admin.email}؟ لن يتمكن من الدخول لوحة الإدارة بعد ذلك.`);
    if (!confirmed) return;
    setBusy(true);
    setListError('');
    try {
      await removeAdmin(admin.id);
      await reload();
    } catch (err) {
      setListError(getApiErrorMessage(err, 'تعذر حذف المدير'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <ShieldCheck size={20} className="text-brand-400" />
        <h2 className="font-bold">إدارة المديرين</h2>
      </div>

      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl bg-white p-4">
        <TextField
          label="بريد المدير الإلكتروني (Gmail)"
          dir="ltr"
          type="email"
          inputMode="email"
          placeholder="name@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {formError && <p className="rounded-lg bg-error-50 p-2.5 text-sm text-error-600">{formError}</p>}
        <Button type="submit" variant="primary" size="md" fullWidth disabled={busy || email.trim() === ''}>
          <span className="flex items-center justify-center gap-1">
            <Plus size={18} /> إضافة مدير
          </span>
        </Button>
      </form>

      {listError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{listError}</p>}
      {loading && <p className="py-6 text-center text-sm text-navy-400">جاري التحميل...</p>}
      {loadError && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-sm text-error-400">تعذر تحميل قائمة المديرين</p>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {!loading && !loadError && admins.length === 0 && (
        <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
          <ShieldCheck className="mx-auto mb-2" size={32} />
          <p>لا يوجد مديرون بعد.</p>
        </div>
      )}

      {admins.map((admin) => {
        const isSelf = admin.email === adminEmail;
        return (
          <div key={admin.id} className="flex items-center justify-between gap-3 rounded-2xl bg-navy-800 p-4">
            <div className="min-w-0">
              <p dir="ltr" className="truncate text-left text-sm font-semibold text-white">
                <Mail size={14} className="mr-1 inline text-navy-400" />
                {admin.email}
              </p>
              {isSelf && <p className="mt-1 text-xs text-navy-400">أنت</p>}
              {admin.isMain && <p className="mt-1 text-xs text-brand-300">المدير الرئيسي</p>}
            </div>
            {isSelf || admin.isMain ? (
              <span className="shrink-0 rounded-full bg-brand-500/20 px-2.5 py-1 text-xs font-semibold text-brand-300">
                {isSelf ? 'حسابك' : 'محمي'}
              </span>
            ) : (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void handleRemove(admin)}>
                <span className="flex items-center gap-1">
                  <Trash2 size={14} /> حذف
                </span>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
