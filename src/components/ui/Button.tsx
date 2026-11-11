import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  fullWidth?: boolean;
};

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-lg shadow-brand-500/30',
  secondary: 'bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900 shadow-lg shadow-navy-700/30',
  outline: 'border-2 border-brand-500 text-brand-600 hover:bg-brand-50 active:bg-brand-100',
  ghost: 'text-navy-700 hover:bg-navy-50 active:bg-navy-100',
  danger: 'bg-error-500 text-white hover:bg-error-600 active:bg-error-600 shadow-lg shadow-error-500/30',
  success: 'bg-success-500 text-white hover:bg-success-600 active:bg-success-600 shadow-lg shadow-success-500/30',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-base rounded-xl',
  lg: 'px-6 py-3.5 text-lg rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  fullWidth = false,
  className = '',
  ...props
}: Props) {
  return (
    <button
      className={`font-bold transition-all duration-200 active:scale-95 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
