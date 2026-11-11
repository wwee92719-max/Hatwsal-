import { User, Car, Shield, ShieldCheck, Truck, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAdminSession } from '@/context/AdminSessionContext';

export function RoleSelection() {
  const { setScreen } = useApp();
  const { isAdmin, signOutAdmin } = useAdminSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 px-6 py-8">
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 shadow-xl shadow-brand-500/40 animate-bounce-sm">
            <Truck className="text-white" size={32} />
          </div>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-white">هتوصل يا نجم</h1>
        <p className="mt-1 text-sm text-brand-300">اختر نوع الحساب للمتابعة</p>
      </div>

      {isAdmin && (
        <div className="mb-4 space-y-2 animate-slide-up">
          <button
            onClick={() => setScreen('admin')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-400 bg-brand-500/20 py-4 font-bold text-white transition-all duration-200 hover:bg-brand-500/30 active:scale-95"
          >
            <ShieldCheck size={20} className="text-brand-300" />
            صفحة الإدارة
          </button>
          <button
            onClick={() => void signOutAdmin()}
            className="flex w-full items-center justify-center gap-1 py-1 text-xs text-white/60 transition-colors hover:text-white"
          >
            <LogOut size={14} />
            تسجيل خروج المدير
          </button>
        </div>
      )}

      <div className="space-y-4 pt-4">
        <button
          onClick={() => setScreen('client')}
          className="group w-full overflow-hidden rounded-3xl bg-gradient-to-l from-brand-500 to-brand-600 p-6 text-right shadow-2xl shadow-brand-500/30 transition-all duration-300 active:scale-95"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <User className="text-white" size={32} />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-extrabold text-white">عميل</h2>
              <p className="text-sm text-white/80">اطلب توصيلة دلوقتي بكل سهولة</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setScreen('driver')}
          className="group w-full overflow-hidden rounded-3xl bg-gradient-to-l from-navy-600 to-navy-700 p-6 text-right shadow-2xl shadow-navy-700/30 transition-all duration-300 active:scale-95"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Car className="text-white" size={32} />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-extrabold text-white">كابتن</h2>
              <p className="text-sm text-white/80">سجل ككابتن وابدأ العمل معنا</p>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-12 flex items-center justify-center gap-2 text-white/30">
        <Shield size={16} />
        <span className="text-xs">تطبيق آمن وموثوق</span>
      </div>
    </div>
  );
}
