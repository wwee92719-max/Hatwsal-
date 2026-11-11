import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { SupportTopBar } from '@/components/SupportTopBar';
import { DriverRegisterForm } from '@/screens/driver/DriverRegisterForm';
import { DriverLogin } from '@/screens/driver/DriverLogin';
import { DriverDashboard } from '@/screens/driver/DriverDashboard';
import type { Driver } from '@/lib/api';

type Mode = 'login' | 'register';

export function DriverPage() {
  const { setScreen } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [driver, setDriver] = useState<Driver | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <SupportTopBar from={driver?.name ?? 'كابتن'} role="driver" />
      <div className="sticky top-0 z-30 bg-gradient-to-l from-navy-800 to-navy-900 px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setScreen('role')}
            className="flex items-center gap-1 text-white/80 transition-colors hover:text-white"
          >
            <ArrowRight size={20} />
            <span className="text-sm">رجوع</span>
          </button>
          <h1 className="text-lg font-bold text-white">صفحة الكابتن</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-5 px-4 py-6 animate-fade-in-up">
        {driver ? (
          <DriverDashboard driver={driver} onLogout={() => setDriver(null)} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-1.5 shadow-sm">
              {(
                [
                  { id: 'login', label: 'لدي حساب' },
                  { id: 'register', label: 'كابتن جديد' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  className={`rounded-lg py-2.5 text-sm font-bold transition-all ${
                    mode === option.id ? 'bg-brand-500 text-white shadow-md' : 'text-navy-600 hover:bg-navy-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {mode === 'login' ? <DriverLogin onLogin={setDriver} /> : <DriverRegisterForm />}
          </>
        )}
      </div>
    </div>
  );
}
