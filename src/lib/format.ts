export function formatMoney(value: number): string {
  return `${value.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
