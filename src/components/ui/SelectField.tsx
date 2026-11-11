import { ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export function SelectField({ label, value, onChange, options, placeholder = 'اختر...', disabled, icon }: Props) {
  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-navy-800 mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 z-10">{icon}</span>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full appearance-none rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base text-navy-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 disabled:bg-gray-100 ${icon ? 'pr-10' : ''}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" size={20} />
      </div>
    </div>
  );
}
