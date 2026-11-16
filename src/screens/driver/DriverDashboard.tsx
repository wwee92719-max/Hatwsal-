import { useCallback, useEffect, useState } from 'react';
import { Check, CalendarClock, LogOut, MapPin, Navigation, Phone, RefreshCw, Wallet, Flag, Receipt, Gift, DollarSign, Power, Handshake, Clock, Navigation2, X, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { showInterstitialAd } from '@/lib/admob';
import { WalletTopUpSection } from '@/screens/driver/WalletTopUpSection';
import { formatDateTime, formatMoney, startOfCurrentMonthIso } from '@/lib/format';
import { getSubscriptionPrice, getRequiredMinBalance } from '@/lib/appSettings';
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
  setDriverOnline,
  type Driver,
  type Trip,
  type WalletTransaction,
} from '@/lib/api';
import { useDriverGps, useIncomingRequests, requestNotificationPermission } from '@/hooks/useDriverDispatch';

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
  requiredMinBalance: number;
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
  const [isOnline, setIsOnline] = useState(driver.isOnline);

  const { currentPos, gpsError } = useDriverGps(driver.id, isOnline);
  const [requiredMinBalance, setRequiredMinBalance] = useState(300);
  const canReceiveRequests = hasActiveSubscription(driver) && driver.walletBalance >= requiredMinBalance;
  const {
    requests,
    biddingTripId,
    setBiddingTripId,
    bidAmount,
    setBidAmount,
    submittingBid,
    handleSubmitBid,
    alertRequest,
    dismissAlert,
  } = useIncomingRequests(driver.id, isOnline, canReceiveRequests);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [fresh, trips, ledger, monthly, subscriptionPrice, requiredMinBalance] = await Promise.all([
        findDriverByPhone(driver.phone),
        listActiveTripsForDriver(driver.id),
        listWalletTransactions({ driverId: driver.id, limit: 20 }),
        listCompletedTripsSince(startOfCurrentMonthIso()),
        getSubscriptionPrice(),
        getRequiredMinBalance(),
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
        requiredMinBalance,
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

  const handleToggleOnline = async () => {
    const next = !isOnline;
    try {
      await setDriverOnline(driver.id, next);
      setIsOnline(next);
      if (next) {
        requestNotificationPermission();
      } else {
        setBiddingTripId(null);
      }
    } catch {
      setNotice({ type: 'error', text: 'تعذر تغيير حالة الاتصال' });
    }
  };

  const handleAcceptPrice = async (trip: Trip) => {
    const amount = trip.suggestedFare ?? trip.clientOffer;
    if (amount <= 0) {
      setBiddingTripId(trip.id);
      return;
    }
    await handleSubmitBid(trip.id, driver.id, amount);
    setNotice({ type: 'success', text: `تم إرسال عرضك: ${formatMoney(amount)}` });
  };

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
        <>
          <div className="flex items-center gap-2 rounded-2xl bg-success-50 p-4 text-sm font-semibold text-success-600">
            <Check size={18} /> اشتراكك فعال حتى {formatDateTime(current.subscriptionExpiresAt ?? '')}
          </div>

          <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isOnline ? 'bg-success-100' : 'bg-gray-100'}`}>
                  <Power size={20} className={isOnline ? 'text-success-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="font-bold text-navy-800">{isOnline ? 'متصل الآن' : 'غير متصل'}</p>
                  <p className="text-xs text-navy-400">{isOnline ? 'ستصلك طلبات العملاء القريبة' : 'فعّل الاتصال لاستقبال الطلبات'}</p>
                </div>
              </div>
              <button
                onClick={handleToggleOnline}
                className={`relative h-8 w-14 rounded-full transition-colors ${isOnline ? 'bg-success-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${isOnline ? 'left-1' : 'right-1'}`} />
              </button>
            </div>
            {gpsError && isOnline && (
              <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-xs font-semibold text-error-600">{gpsError}</p>
            )}
            {isOnline && 'Notification' in window && Notification.permission !== 'granted' && (
              <button
                onClick={() => requestNotificationPermission()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
              >
                فعّل إشعارات المتصفح لتصلك تنبيهات الطلبات حتى في الخلفية
              </button>
            )}
            {isOnline && 'Notification' in window && Notification.permission === 'granted' && (
              <p className="mt-2 text-center text-xs font-semibold text-success-500">إشعارات المتصفح مفعّلة</p>
            )}
            {isOnline && currentPos && (
              <p className="mt-2 flex items-center gap-1 text-xs text-navy-400">
                <Navigation2 size={12} /> موقعك الحالي: {currentPos.lat.toFixed(4)}, {currentPos.lng.toFixed(4)}
              </p>
            )}
          </div>
        </>
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

      {isOnline && isSubscribed && requests.length > 0 && (
        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4 shadow-sm animate-slide-up">
          <div className="mb-3 flex items-center gap-2">
            <Handshake className="text-brand-500" size={20} />
            <h3 className="font-bold text-navy-800">طلبات عملاء قريبة ({requests.length})</h3>
          </div>
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="rounded-xl border-2 border-gray-100 bg-white p-3 animate-slide-in-right">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-navy-800">{req.clientName}</p>
                    <a href={`tel:${req.clientPhone}`} className="flex items-center gap-1 text-sm text-brand-600">
                      <Phone size={14} /> {req.clientPhone}
                    </a>
                  </div>
                  {req.suggestedFare !== null && (
                    <div className="text-left">
                      <p className="text-xs text-navy-400">السعر المقترح</p>
                      <p className="text-lg font-extrabold text-brand-600">{formatMoney(req.suggestedFare)}</p>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-sm text-navy-600">
                  <p className="flex items-center gap-1"><MapPin size={14} className="text-brand-500" /> من: {req.pickup}</p>
                  <p className="flex items-center gap-1"><Navigation size={14} className="text-navy-500" /> إلى: {req.dropoff}</p>
                  {req.distanceKm !== null && (
                    <p className="flex items-center gap-1 text-navy-400"><Navigation2 size={12} /> المسافة: {req.distanceKm} كم</p>
                  )}
                  {req.clientOffer > 0 && (
                    <p className="flex items-center gap-1"><DollarSign size={14} className="text-success-500" /> عرض العميل: {formatMoney(req.clientOffer)}</p>
                  )}
                </div>
                {biddingTripId === req.id ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="اكتب سعرك"
                        className="w-full rounded-xl border-2 border-gray-200 px-4 py-2 text-base text-navy-900 focus:border-brand-500 focus:outline-none"
                      />
                      <span className="text-sm text-navy-400">جنيه</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        className="flex-1"
                        disabled={submittingBid || !bidAmount || Number(bidAmount) <= 0}
                        onClick={() => handleSubmitBid(req.id, driver.id, Number(bidAmount))}
                      >
                        {submittingBid ? 'جاري الإرسال...' : 'إرسال العرض'}
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setBiddingTripId(null); setBidAmount(''); }}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {(req.suggestedFare ?? req.clientOffer) > 0 && (
                      <Button variant="success" size="sm" className="flex-1" onClick={() => handleAcceptPrice(req)}>
                        قبول السعر
                      </Button>
                    )}
                    <Button
                      variant={req.suggestedFare ? 'outline' : 'primary'}
                      size="sm"
                      className="flex-1"
                      onClick={() => { setBiddingTripId(req.id); setBidAmount(String(req.suggestedFare ?? req.clientOffer ?? '')); }}
                    >
                      <span className="flex items-center justify-center gap-1">
                        <Handshake size={16} /> عرض سعر
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOnline && isSubscribed && requests.length === 0 && (
        <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <Clock className="mx-auto text-navy-300" size={28} />
          <p className="mt-2 text-sm text-navy-400">في انتظار طلبات العملاء القريبة...</p>
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
        onClick={() => {
          if (isOnline) void setDriverOnline(driver.id, false);
          onLogout();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-100 py-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-200"
      >
        <LogOut size={18} />
        تسجيل الخروج
      </button>

      {alertRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="mx-6 w-full max-w-sm animate-pop rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <Handshake className="text-brand-500" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-navy-800">طلب جديد قريب منك!</h3>
                  <p className="text-xs text-navy-400">عميل يطلب رحلة ضمن نطاقك</p>
                </div>
              </div>
              <button
                onClick={() => dismissAlert(alertRequest.id)}
                className="rounded-lg p-1 text-navy-300 transition-colors hover:bg-gray-100 hover:text-navy-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <User size={16} className="text-brand-500" />
                <p className="font-bold text-navy-800">{alertRequest.clientName}</p>
              </div>
              <a href={`tel:${alertRequest.clientPhone}`} className="flex items-center gap-2 text-sm text-brand-600">
                <Phone size={14} /> {alertRequest.clientPhone}
              </a>
              <p className="flex items-center gap-1 text-sm text-navy-600">
                <MapPin size={14} className="text-brand-500" /> من: {alertRequest.pickup}
              </p>
              <p className="flex items-center gap-1 text-sm text-navy-600">
                <Navigation size={14} className="text-navy-500" /> إلى: {alertRequest.dropoff}
              </p>
              {alertRequest.suggestedFare !== null && (
                <p className="flex items-center gap-1 text-sm font-semibold text-navy-700">
                  <DollarSign size={14} className="text-success-500" /> السعر المقترح: {formatMoney(alertRequest.suggestedFare)}
                </p>
              )}
              {alertRequest.clientOffer > 0 && (
                <p className="flex items-center gap-1 text-sm font-semibold text-navy-700">
                  <DollarSign size={14} className="text-brand-500" /> عرض العميل: {formatMoney(alertRequest.clientOffer)}
                </p>
              )}
            </div>

            {biddingTripId === alertRequest.id ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="اكتب سعرك"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2 text-base text-navy-900 focus:border-brand-500 focus:outline-none"
                  />
                  <span className="text-sm text-navy-400">جنيه</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    size="md"
                    fullWidth
                    disabled={submittingBid || !bidAmount || Number(bidAmount) <= 0}
                    onClick={() => handleSubmitBid(alertRequest.id, driver.id, Number(bidAmount))}
                  >
                    {submittingBid ? 'جاري الإرسال...' : 'إرسال العرض'}
                  </Button>
                  <Button variant="outline" size="md" fullWidth onClick={() => { setBiddingTripId(null); setBidAmount(''); }}>
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                {(alertRequest.suggestedFare ?? alertRequest.clientOffer) > 0 && (
                  <Button
                    variant="success"
                    size="md"
                    fullWidth
                    onClick={() => handleAcceptPrice(alertRequest)}
                  >
                    قبول السعر
                  </Button>
                )}
                <Button
                  variant={alertRequest.suggestedFare ? 'outline' : 'primary'}
                  size="md"
                  fullWidth
                  onClick={() => {
                    setBiddingTripId(alertRequest.id);
                    setBidAmount(String(alertRequest.suggestedFare ?? alertRequest.clientOffer ?? ''));
                  }}
                >
                  <span className="flex items-center justify-center gap-1">
                    <Handshake size={16} /> عرض سعر
                  </span>
                </Button>
              </div>
            )}

            <button
              onClick={() => dismissAlert(alertRequest.id)}
              className="mt-3 w-full rounded-xl bg-error-50 py-2.5 text-sm font-semibold text-error-600 transition-colors hover:bg-error-100"
            >
              رفض الطلب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
