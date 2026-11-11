import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: React.ReactNode;
};

export function TextField({ label, icon, className = '', ...props }: Props) {
  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-semibold text-navy-800 mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400">{icon}</span>
        )}
        <input
          className={`w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base text-navy-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${icon ? 'pr-10' : ''}`}
          {...props}
        />
      </div>
    </div>
  );
}
