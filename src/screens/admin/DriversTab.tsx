import { useEffect, useState } from 'react';
import { Car, Check, Pencil, TrendingUp, Trash2, X, IdCard, User, MapPin, Truck, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatMoney, startOfCurrentMonthIso } from '@/lib/format';
import { getApiErrorMessage, listCompletedTripsSince, setDriverStatus, type Driver } from '@/lib/api';
import { deleteDriver } from '@/lib/adminApi';
import { useDriverIdPhotos, type PhotoState } from '@/context/DriverIdPhotosContext';
import { DriverEditForm } from '@/screens/admin/DriverEditForm';

type Props = {
  drivers: Driver[];
  loading: boolean;
  error: boolean;
  onChanged: () => void;
};

export function DriversTab({ drivers, loading, error, onChanged }: Props) {
  const [monthly, setMonthly] = useState<Record<string, { trips: number; earnings: number }>>({});
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { getPhoto, requestPhotos, retryPhoto } = useDriverIdPhotos();

  const pending = drivers.filter((d) => d.status === 'pending');
  const others = drivers.filter((d) => d.status !== 'pending');

  useEffect(() => {
    listCompletedTripsSince(startOfCurrentMonthIso())
      .then((rows) => {
        const totals: Record<string, { trips: number; earnings: number }> = {};
        for (const row of rows) {
          const current = totals[row.driverId] ?? { trips: 0, earnings: 0 };
          totals[row.driverId] = { trips: current.trips + 1, earnings: current.earnings + row.driverEarning };
        }
        setMonthly(totals);
      })
      .catch(() => setMonthly({}));
  }, [drivers]);

  useEffect(() => {
    drivers.filter((d) => d.status === 'pending').forEach(requestPhotos);
  }, [drivers, requestPhotos]);

  const totalEarnings = Object.values(monthly).reduce((sum, m) => sum + m.earnings, 0);
  const totalTrips = Object.values(monthly).reduce((sum, m) => sum + m.trips, 0);

  const changeStatus = async (driverId: string, status: 'approved' | 'rejected') => {
    setBusyId(driverId);
    setActionError('');
    try {
      await setDriverStatus(driverId, status);
      onChanged();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'تعذر تحديث حالة الكابتن'));
    } finally {
      setBusyId(null);
    }
  };

  const removeDriver = async (driver: Driver) => {
    const confirmed = window.confirm(
      `حذف الكابتن ${driver.name} نهائياً؟\nسيتم حذف رحلاته وسجل محفظته أيضاً ولا يمكن التراجع.`,
    );
    if (!confirmed) return;
    setBusyId(driver.id);
    setActionError('');
    try {
      await deleteDriver(driver.id);
      onChanged();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'تعذر حذف الكابتن'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSaved = () => {
    setEditingId(null);
    onChanged();
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Car size={20} className="text-brand-400" />
        <h2 className="font-bold">بيانات الكابتن</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-4">
          <TrendingUp className="mb-1 text-white/80" size={20} />
          <p className="text-2xl font-extrabold text-white">{formatMoney(totalEarnings)}</p>
          <p className="text-xs text-white/80">أرباح الكباتن هذا الشهر</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-navy-600 to-navy-700 p-4">
          <Car className="mb-1 text-white/80" size={20} />
          <p className="text-2xl font-extrabold text-white">{totalTrips}</p>
          <p className="text-xs text-white/80">رحلات هذا الشهر</p>
        </div>
      </div>

      {actionError && <p className="rounded-xl bg-error-500/20 p-3 text-sm text-error-400">{actionError}</p>}
      {loading && drivers.length === 0 && <p className="py-6 text-center text-sm text-navy-400">جاري التحميل...</p>}
      {error && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-sm text-error-400">تعذر تحميل الكباتن</p>
          <Button variant="secondary" size="sm" onClick={onChanged}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <IdCard size={18} className="text-warning-400" />
            <h3 className="font-bold text-white/90">طلبات الانضمام الجديدة</h3>
            <span className="rounded-full bg-warning-500/20 px-2 py-0.5 text-xs font-semibold text-warning-400">
              {pending.length} طلب
            </span>
          </div>

          {pending.map((d) => (
            <div key={d.id} className="rounded-2xl border border-warning-500/30 bg-navy-800 p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-bold text-white">
                    <User size={16} className="text-brand-400" />
                    {d.name}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-navy-400">
                    <MapPin size={14} />
                    {d.address || '-'}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-navy-400">
                    <Truck size={14} />
                    {d.vehicleType}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-warning-500/20 px-2.5 py-1 text-xs font-semibold text-warning-400">
                  قيد الانتظار
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-navy-700 pt-3">
                <PhotoCard
                  label="البطاقة (وجه)"
                  photo={getPhoto(d.id, 'front')}
                  hasPath={Boolean(d.idFrontPath)}
                  onRetry={() => retryPhoto(d, 'front')}
                />
                <PhotoCard
                  label="البطاقة (ظهر)"
                  photo={getPhoto(d.id, 'back')}
                  hasPath={Boolean(d.idBackPath)}
                  onRetry={() => retryPhoto(d, 'back')}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <Button variant="success" size="sm" fullWidth disabled={busyId === d.id} onClick={() => changeStatus(d.id, 'approved')}>
                  <span className="flex items-center justify-center gap-1">
                    <Check size={16} /> قبول الطلب وتفعيل الحساب
                  </span>
                </Button>
                <Button variant="danger" size="sm" fullWidth disabled={busyId === d.id} onClick={() => changeStatus(d.id, 'rejected')}>
                  <span className="flex items-center justify-center gap-1">
                    <X size={16} /> رفض الطلب
                  </span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-3 pt-2">
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <Car size={18} className="text-brand-400" />
              <h3 className="font-bold text-white/90">الكباتن المسجلين</h3>
            </div>
          )}
          {others.map((d) => {
            const stats = monthly[d.id] ?? { trips: 0, earnings: 0 };
            return (
              <div key={d.id} className="rounded-2xl bg-navy-800 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-white">{d.name}</p>
                    <p dir="ltr" className="text-right text-sm text-navy-300">{d.phone}</p>
                    <p className="text-xs text-navy-400">{d.address}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      d.status === 'approved'
                        ? 'bg-success-500/20 text-success-400'
                        : 'bg-error-500/20 text-error-400'
                    }`}
                  >
                    {d.status === 'approved' ? 'معتمد' : 'مرفوض'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-navy-700 pt-3">
                  <div className="text-center">
                    <p className="text-xs text-navy-400">المركبة</p>
                    <p className="text-sm font-semibold text-white">{d.vehicleType}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-navy-400">رحلات الشهر</p>
                    <p className="text-sm font-semibold text-brand-400">{stats.trips}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-navy-400">أرباح الشهر</p>
                    <p className="text-sm font-semibold text-success-400">{formatMoney(stats.earnings)}</p>
                  </div>
                </div>

                {editingId === d.id ? (
                  <DriverEditForm driver={d} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" fullWidth disabled={busyId === d.id} onClick={() => setEditingId(d.id)}>
                      <span className="flex items-center justify-center gap-1">
                        <Pencil size={14} /> تعديل
                      </span>
                    </Button>
                    <Button variant="danger" size="sm" fullWidth disabled={busyId === d.id} onClick={() => removeDriver(d)}>
                      <span className="flex items-center justify-center gap-1">
                        <Trash2 size={14} /> حذف
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && drivers.length === 0 && (
        <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
          <Clock className="mx-auto mb-2" size={32} />
          <p>لا يوجد كباتن مسجلون</p>
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  label,
  photo,
  hasPath,
  onRetry,
}: {
  label: string;
  photo: PhotoState;
  hasPath: boolean;
  onRetry: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const retry = () => {
    setImageFailed(false);
    onRetry();
  };

  const url = photo.status === 'ready' && !imageFailed ? photo.url : null;
  const showError = photo.status === 'error' || imageFailed;

  return (
    <div className="rounded-xl bg-navy-900 p-2">
      <p className="mb-2 text-center text-xs font-semibold text-navy-300">{label}</p>
      {!hasPath ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg bg-navy-700 text-xs text-navy-500">
          <IdCard size={24} className="mb-1 opacity-50" />
          لا توجد صورة
        </div>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg"
          title="فتح الصورة بالحجم الكامل"
        >
          <img
            src={url}
            alt={label}
            className="h-32 w-full object-cover transition-transform duration-300 hover:scale-105"
            onError={() => setImageFailed(true)}
          />
        </a>
      ) : showError ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg bg-navy-700 text-xs text-error-400">
          <IdCard size={24} className="text-navy-500" />
          <span>تعذر تحميل الصورة</span>
          <button
            onClick={retry}
            className="flex items-center gap-1 rounded-md bg-navy-600 px-2 py-1 text-navy-100 transition-colors hover:bg-navy-500"
          >
            <RefreshCw size={12} /> إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg bg-navy-700">
          <Loader2 className="animate-spin text-navy-400" size={24} />
        </div>
      )}
    </div>
  );
}
