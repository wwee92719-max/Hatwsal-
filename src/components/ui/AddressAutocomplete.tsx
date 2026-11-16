import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { searchAddresses, type AddressSuggestion, type LatLng } from '@/lib/tripRoute';

type Props = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
  onSuggestionSelect: (suggestion: AddressSuggestion) => void;
  icon: React.ReactNode;
  delayMs?: number;
};

export function AddressAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  onSuggestionSelect,
  icon,
  delayMs = 500,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await searchAddresses(value);
      setSuggestions(results);
      setLoading(false);
      setOpen(true);
    }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.displayName);
    onSuggestionSelect(suggestion);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-semibold text-navy-600">{label}</label>
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300">{icon}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border-2 border-gray-200 py-2.5 pr-10 pl-4 text-base text-navy-900 transition-colors focus:border-brand-500 focus:outline-none"
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-brand-400" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border-2 border-gray-100 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-start gap-2 border-b border-gray-50 px-3 py-2.5 text-right transition-colors last:border-0 hover:bg-brand-50"
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-brand-400" />
              <span className="text-sm text-navy-700 line-clamp-2">{s.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type { AddressSuggestion, LatLng };
