import { useCallback, useEffect, useState } from 'react';
import { Check, CalendarClock, LogOut, MapPin, Navigation, Phone, RefreshCw, Wallet, Flag, Receipt, Gift, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { showInterstitialAd } from '@/lib/admob';
import { WalletTopUpSection } from '@/screens/driver/WalletTopUpSection';
import { formatDateTime, formatMoney, startOfCurrentMonthIso } from '@/lib/format';
import { getSubscriptionPrice } from '@/lib/appSettings';
import {
  completeTrip,
  findDriverByPhone,
  getApiErrorMessage,
  hasActiveSubscription,
  isCustomerNew,
  listActiveTripsForDriver,
  listCompletedTripsSince,
  listWalletTransactions,
  renewDriverSubscription,
  type Driver,
  type Trip,
  type WalletTransaction,
} from '@/lib/api';

type TripBreakdown = {
  cashFromCustomer: number;
  compensation: number;
  isNew: boolean;
};

type Snapshot = {
  driver: Driver;
  trips: Trip[];
  ledger: WalletTransaction[];
  monthlyTrips: number;
  monthlyEarnings: number;
  subscriptionPrice: number;
  breakdowns: Record<string, TripBreakdown>;
};

type Notice = { type: 'success' | 'error'; text: string } | null;

type Props = { driver: Driver; onLogout: () => void };

export function DriverDashboard({ driver, onLogout }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [fresh, trips, ledger, monthly, subscriptionPrice] = await Promise.all([
        findDriverByPhone(driver.phone),
        listActiveTripsForDriver(driver.id),
        listWalletTransactions({ driverId: driver.id, limit: 20 }),
        listCompletedTripsSince(startOfCurrentMonthIso()),
        getSubscriptionPrice(),
      ]);
      if (!fresh) {
        setLoadError('تعذر العثور على حسابك، حاول تسجيل الدخول مرة أخرى');
        return;
      }
      const mine = monthly.filter((row) => row.driverId === driver.id);
      const breakdowns: Record<string, TripBreakdown> = {};
      for (const trip of trips) {
        const isNew = await isCustomerNew(trip.clientPhone).catch(() => false);
        const fare = trip.finalFare ?? 0;
        breakdowns[trip.id] = {
          cashFromCustomer: fare,
          compensation: isNew ? fare : 0,
          isNew,
        };
      }
      setSnapshot({
        driver: fresh,
        trips,
        ledger,
        monthlyTrips: mine.length,
        monthlyEarnings: mine.reduce((sum, row) => sum + row.driverEarning, 0),
        subscriptionPrice,
        breakdowns,
      });
      setLoadError('');
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'تعذر تحميل البيانات، حاول مرة أخرى'));
    } finally {
      setRefreshing(false);
    }
  }, [driver.id, driver.phone]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleComplete = async (trip: Trip) => {
    setCompletingId(trip.id);
    setNotice(null);
    try {
      const result = await completeTrip(trip.id, driver.phone);
      const cashFromCustomer = result.isNewCustomer ? result.originalFare / 2 : result.originalFare;
      setNotice({
        type: 'success',
        text: [
          'تم إنهاء الرحلة بنجاح',
          `الكاش من العميل: ${formatMoney(cashFromCustomer)}`,
          result.isNewCustomer ? `تعويض خصم مضاف للمحفظة: +${formatMoney(result.discountAmount)}` : null,
          `صافي ربحك: ${formatMoney(result.driverEarning)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      });
      await refresh();
      void showInterstitialAd();
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'تعذر إنهاء الرحلة، حاول مرة أخرى') });
    } finally {
      setCompletingId(null);
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    setNotice(null);
    try {
      const result = await renewDriverSubscription(driver.phone);
      setNotice({
        type: 'success',
        text: `تم تجديد الاشتراك حتى ${formatDateTime(result.expiresAt)}`,
      });
      await refresh();
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'تعذر تجديد الاشتراك، حاول مرة أخرى') });
    } finally {
      setRenewing(false);
    }
  };

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center py-12 text-navy-500">
        {loadError ? (
          <>
            <p className="text-center font-semibold text-error-600">{loadError}</p>
            <Button variant="outline" size="md" className="mt-4" onClick={refresh}>
              إعادة المحاولة
            </Button>
          </>
        ) : (
          <p className="animate-pulse-soft">جاري تحميل المحفظة...</p>
        )}
      </div>
    );
  }

  const { trips, ledger, monthlyTrips, monthlyEarnings, breakdowns, subscriptionPrice } = snapshot;
  const current = snapshot.driver;
  const isSubscribed = hasActiveSubscription(current);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-l from-navy-800 to-navy-900 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-white/70">مرحباً</p>
            <p className="text-lg font-bold">{current.name}</p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="تحديث"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-white/70">
          <Wallet size={18} />
          <span className="text-sm">رصيد محفظتك الحالي:</span>
        </div>
        <p className={`mt-1 text-3xl font-extrabold ${current.walletBalance < 0 ? 'text-error-400' : 'text-brand-400'}`}>
          {current.walletBalance.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} جنيه
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-center">
          <div>
            <p className="text-lg font-bold">{monthlyTrips}</p>
            <p className="text-xs text-white/60">رحلات الشهر</p>
          </div>
          <div>
            <p className="text-lg font-bold text-success-400">{formatMoney(monthlyEarnings)}</p>
            <p className="text-xs text-white/60">أرباح الشهر</p>
          </div>
        </div>
      </div>

      {isSubscribed ? (
        <div className="flex items-center gap-2 rounded-2xl bg-success-50 p-4 text-sm font-semibold text-success-600">
          <Check size={18} /> اشتراكك فعال حتى {formatDateTime(current.subscriptionExpiresAt ?? '')} ويمكنك استقبال طلبات العملاء
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border-2 border-warning-400 bg-warning-50 p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <CalendarClock size={22} className="mt-0.5 shrink-0 text-warning-600" />
            <div>
              <p className="font-bold text-warning-600">اشتراكك منتهٍ، جدده لتلقي الطلبات</p>
              <p className="mt-1 text-sm text-navy-600">
                الاشتراك {formatMoney(subscriptionPrice)} لمدة 30 يوم، يُخصم من محفظتك
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={renewing || current.walletBalance < subscriptionPrice}
            onClick={handleRenew}
          >
            {renewing ? 'جاري التجديد...' : `تجديد الاشتراك (${formatMoney(subscriptionPrice)})`}
          </Button>
          {current.walletBalance < subscriptionPrice && (
            <p className="text-center text-xs text-navy-500">اشحن محفظتك أولاً لتتمكن من تجديد الاشتراك</p>
          )}
        </div>
      )}

      <WalletTopUpSection driverId={current.id} />

      {notice && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            notice.type === 'success' ? 'bg-success-50 text-success-600' : 'bg-error-50 text-error-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
          <Navigation size={20} className="text-brand-500" />
          الرحلات الحالية
        </h3>
        {trips.length === 0 ? (
          <p className="py-4 text-center text-sm text-navy-400">لا توجد رحلات نشطة حالياً</p>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => {
              const bd = breakdowns[trip.id];
              return (
                <div key={trip.id} className="rounded-xl border-2 border-gray-100 bg-gray-50 p-4 animate-slide-in-right">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-navy-800">{trip.clientName}</p>
                      <a href={`tel:${trip.clientPhone}`} className="flex items-center gap-1 text-sm text-brand-600">
                        <Phone size={14} /> {trip.clientPhone}
                      </a>
                    </div>
                    <p className="text-xl font-extrabold text-brand-600">{formatMoney(trip.finalFare ?? 0)}</p>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-navy-600">
                    <p className="flex items-center gap-1"><MapPin size={14} className="text-brand-500" /> من: {trip.pickup}</p>
                    <p className="flex items-center gap-1"><Navigation size={14} className="text-navy-500" /> إلى: {trip.dropoff}</p>
                  </div>
                  {bd && (
                    <div className="mt-3 space-y-2 rounded-lg bg-white p-3 text-sm">
                      {bd.isNew && (
                        <div className="flex items-center gap-1.5 rounded-md bg-success-100 px-2.5 py-1 text-xs font-bold text-success-700">
                          <Gift size={14} /> عميل جديد — خصم 50%
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-navy-500">
                          <DollarSign size={14} className="text-success-500" /> الكاش من العميل
                        </span>
                        <span className="font-bold text-success-600">{formatMoney(bd.cashFromCustomer)}</span>
                      </div>
                      {bd.compensation > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-navy-500">
                            <Gift size={14} className="text-brand-500" /> تعويض مضاف للمحفظة
                          </span>
                          <span className="font-bold text-brand-600">+{formatMoney(bd.compensation)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    variant="success"
                    size="md"
                    fullWidth
                    className="mt-4"
                    disabled={completingId !== null}
                    onClick={() => handleComplete(trip)}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Flag size={18} />
                      {completingId === trip.id ? 'جاري الإنهاء...' : 'إنهاء الرحلة'}
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
          <Receipt size={20} className="text-brand-500" />
          سجل المحفظة
        </h3>
        {ledger.length === 0 ? (
          <p className="py-4 text-center text-sm text-navy-400">لا توجد حركات بعد</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((row) => {
              const isTopup = row.kind === 'topup';
              const isCompensation = row.kind === 'discount_compensation';
              const label = isTopup
                ? 'شحن من الإدارة (كاش)'
                : isCompensation
                  ? 'تعويض خصم عميل جديد'
                  : row.kind === 'subscription'
                    ? 'اشتراك شهري (30 يوم)'
                    : row.note || 'عمولة (قبل تطبيق الاشتراك)';
              const isPositive = isTopup || isCompensation;
              return (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    {isCompensation && <Gift size={16} className="text-success-500" />}
                    <div>
                      <p className="text-sm font-semibold text-navy-800">{label}</p>
                      <p className="text-xs text-navy-400">{formatDateTime(row.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={`font-bold ${isPositive ? 'text-success-600' : 'text-error-600'}`}>
                      {isPositive ? '+' : '-'}
                      {formatMoney(Math.abs(row.amount))}
                    </p>
                    <p className="text-xs text-navy-400">الرصيد: {formatMoney(row.balanceAfter)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-100 py-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-200"
      >
        <LogOut size={18} />
        تسجيل الخروج
      </button>
    </div>
  );
}
