import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const rotatingWords = ['بضاعه', 'مناطق', 'أسواق', 'كافيهات', 'مطاعم', 'سوبر ماركت'];

const collageImages = [
  'https://images.pexels.com/photos/16905167/pexels-photo-16905167.png?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/34807169/pexels-photo-34807169.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/18533353/pexels-photo-18533353.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/40292015/pexels-photo-40292015.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/5374428/pexels-photo-5374428.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/4913911/pexels-photo-4913911.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
];

export function SplashScreen() {
  const { setScreen } = useApp();
  const [wordIndex, setWordIndex] = useState(0);
  const [fadeWord, setFadeWord] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeWord(false);
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % rotatingWords.length);
        setFadeWord(true);
      }, 300);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 2700);
    const navTimer = setTimeout(() => setScreen('role'), 3200);
    return () => {
      clearTimeout(timer);
      clearTimeout(navTimer);
    };
  }, [setScreen]);

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-navy-900 transition-opacity duration-500 ${
        exiting ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Background collage */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 opacity-30">
        {collageImages.concat(collageImages).slice(0, 9).map((src, i) => (
          <div
            key={i}
            className="overflow-hidden bg-navy-800"
            style={{ animation: `fadeIn 1s ease-out ${i * 0.15}s both` }}
          >
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              style={{ filter: 'blur(1px) saturate(1.2)' }}
            />
          </div>
        ))}
      </div>

      {/* Dark overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/70 via-navy-900/60 to-navy-900/90" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        <div className="mb-8 animate-float">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-500 shadow-2xl shadow-brand-500/50">
            <Truck className="text-white" size={48} />
          </div>
        </div>

        <div className="text-center">
          <h1 className="font-display text-5xl font-extrabold text-white drop-shadow-lg">
            هتوصل يا نجم
          </h1>

          <div className="mt-8 flex items-center justify-center gap-2 text-3xl font-bold">
            <span className="text-brand-400">توصيل</span>
            <span
              className={`inline-block min-w-[140px] text-right text-white transition-all duration-300 ${
                fadeWord ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
              }`}
            >
              {rotatingWords[wordIndex]}
            </span>
          </div>
        </div>

        {/* Loading bar */}
        <div className="absolute bottom-20 left-1/2 h-1.5 w-48 -translate-x-1/2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ animation: 'shimmer 3s ease-out forwards', width: '100%', transformOrigin: 'right' }}
          />
        </div>

        <p className="absolute bottom-10 text-sm text-white/60">خدمات توصيل متكاملة في كل مصر</p>
      </div>
    </div>
  );
}
