import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';

export function ExitScreen() {
  const { setScreen } = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    const timer = setTimeout(() => setScreen('role'), 3000);
    return () => clearTimeout(timer);
  }, [setScreen]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-brand-50 via-white to-navy-50">
      <div
        className={`text-8xl transition-all duration-700 ${
          visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}
        style={{ animation: 'float 3s ease-in-out infinite 0.7s' }}
      >
        😊
      </div>
      <h2
        className={`mt-6 font-display text-4xl font-extrabold text-gradient-brand transition-all duration-700 delay-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        مع السلامة
      </h2>
      <p
        className={`mt-2 text-lg text-navy-600 transition-all duration-700 delay-300 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        شكراً لاستخدامك هتوصل يا نجم
      </p>
      <div
        className={`mt-8 h-1 w-32 overflow-hidden rounded-full bg-brand-200 transition-all duration-700 delay-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="h-full w-full animate-pulse-soft rounded-full bg-brand-500" />
      </div>
    </div>
  );
}
