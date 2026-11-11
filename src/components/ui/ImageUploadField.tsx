import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { AlertCircle, Camera, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { compressImage } from '@/lib/imageCompression';

const MAX_RAW_FILE_MB = 20;

type Props = {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  capture?: 'environment';
  disabled?: boolean;
};

export function ImageUploadField({ label, value, onChange, capture, disabled = false }: Props) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const locked = disabled || preparing;
  const PickIcon = capture ? Camera : ImagePlus;
  const pickHint = capture ? 'اضغط لفتح الكاميرا' : 'اضغط لاختيار صورة';
  const replaceHint = capture ? 'إعادة التصوير' : 'تغيير الصورة';

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!selected) return;
    setError('');
    if (selected.size > MAX_RAW_FILE_MB * 1024 * 1024) {
      setError(`حجم الصورة يجب ألا يتجاوز ${MAX_RAW_FILE_MB} ميجابايت`);
      return;
    }
    setPreparing(true);
    try {
      onChange(await compressImage(selected));
    } catch {
      setError('تعذر قراءة الصورة، جرب صورة أخرى');
    } finally {
      setPreparing(false);
    }
  };

  const labelClass = `inline-flex items-center justify-center gap-2 rounded-xl transition-all ${
    locked ? 'pointer-events-none opacity-50' : 'cursor-pointer active:scale-[0.98]'
  }`;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-navy-800">{label}</span>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture={capture}
        disabled={locked}
        onChange={handleChange}
        className="sr-only"
      />

      {preview ? (
        <div className="overflow-hidden rounded-xl border-2 border-success-400 bg-success-50 p-2">
          <img src={preview} alt={label} className="h-40 w-full rounded-lg bg-white object-contain" />
          <label
            htmlFor={inputId}
            aria-disabled={locked}
            className={`${labelClass} mt-2 w-full bg-white px-4 py-2.5 text-sm font-semibold text-brand-600 shadow-sm hover:bg-brand-50`}
          >
            <RefreshCw size={16} />
            {replaceHint}
          </label>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          aria-disabled={locked}
          className={`${labelClass} flex h-40 w-full flex-col border-2 border-dashed border-navy-200 bg-navy-50 hover:border-brand-400 hover:bg-brand-50`}
        >
          {preparing ? (
            <Loader2 className="animate-spin text-brand-500" size={28} />
          ) : (
            <PickIcon className="text-brand-500" size={28} />
          )}
          <span className="text-sm font-semibold text-navy-600">
            {preparing ? 'جاري تجهيز الصورة...' : pickHint}
          </span>
        </label>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-error-600">
          <AlertCircle size={16} /> {error}
        </p>
      )}
    </div>
  );
}
