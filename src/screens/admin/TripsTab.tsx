import { useEffect, useState } from 'react';
import { Route, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { deleteTrip, listAdminTrips, type AdminTrip } from '@/lib/adminApi';

const TRIP_LIMIT = 100;

export function TripsTab() {
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    listAdminTrips(TRIP_LIMIT)
      .then((rows) => {
        if (!active) return;
        setTrips(rows);
        setLoadError('');
      })
      .catch(() => {
        if (active) setLoadError('تعذر تحميل الرحلات');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const removeTrip = async (trip: AdminTrip) => {
    const confirmed = window.confirm(
      `حذف رحلة ${trip.clientName} من ${trip.pickup} إلى ${trip.dropoff}؟\nلا يمكن التراجع عن هذا الإجراء.`,
    );
    if (!confirmed) return;
    setBusyId(trip.id);
    setActionError('');
    try {
      await deleteTrip(trip.id);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'تعذر حذف الرحلة'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Route size={20} className="text-brand-400" />
        <h2 className="font-bold">الرحلات</h2>
        <span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs text-navy-300">آخر {TRIP_LIMIT} رحلة</span>
      </div>

      {actionError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{actionError}</p>}
      {loading && <p className="py-6 text-center text-sm text-navy-400">جاري التحميل...</p>}
      {loadError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{loadError}</p>}
      {!loading && !loadError && trips.length === 0 && (
        <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
          <Route className="mx-auto mb-2" size={32} />
          <p>لا توجد رحلات بعد</p>
        </div>
      )}

      {trips.map((trip) => {
        const completed = trip.status === 'completed';
        return (
          <div key={trip.id} className="rounded-2xl bg-navy-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white">{trip.clientName}</p>
                <p dir="ltr" className="text-right text-sm text-navy-300">{trip.clientPhone}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  completed ? 'bg-success-500/20 text-success-400' : 'bg-brand-500/20 text-brand-300'
                }`}
              >
                {completed ? 'مكتملة' : 'نشطة'}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-navy-300">
              <p>من: {trip.pickup}</p>
              <p>إلى: {trip.dropoff}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-navy-700 pt-3 text-center">
              <div>
                <p className="text-xs text-navy-400">الكابتن</p>
                <p className="text-sm font-semibold text-white">{trip.driverName}</p>
              </div>
              <div>
                <p className="text-xs text-navy-400">السعر</p>
                <p className="text-sm font-semibold text-brand-400">
                  {trip.finalFare === null ? '-' : formatMoney(trip.finalFare)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-navy-400">{formatDateTime(trip.createdAt)}</p>

            {completed ? (
              <p className="mt-3 text-center text-xs text-navy-400">الرحلة المكتملة سجل مالي ولا يمكن حذفها</p>
            ) : (
              <Button
                variant="danger"
                size="sm"
                fullWidth
                className="mt-3"
                disabled={busyId === trip.id}
                onClick={() => removeTrip(trip)}
              >
                <span className="flex items-center justify-center gap-1">
                  <Trash2 size={14} /> حذف الرحلة
                </span>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
