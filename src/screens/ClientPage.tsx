import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowRight,
  User,
  Phone,
  MapPin,
  Navigation,
  DollarSign,
  CheckCircle2,
  Truck,
  Clock,
  Handshake,
  AlertCircle,
  Flag,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { SelectField } from '@/components/ui/SelectField';
import { SupportTopBar } from '@/components/SupportTopBar';
import { vehicleTypes } from '@/data/vehicles';
import { egyptProvinces, provinceNames } from '@/data/egyptData';
import {
  getApiErrorMessage,
  isCustomerNew,
  createPendingTrip,
  cancelPendingTrip,
  acceptBidAndAssignDriver,
  listBidsForTrip,
  getTripById,
  type RideBid,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { TripMap } from '@/components/trip/TripMap';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useTripPlanner } from '@/hooks/useTripPlanner';

type Phase = 'form' | 'searching' | 'enroute' | 'cancelled';

type AcceptedBid = {
  id: string;
  driverName: string;
  vehicle: string;
  offer: number;
};

export function ClientPage() {
  const { setScreen, addClient, addNegotiation, addDispute } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [suggestedFare, setSuggestedFare] = useState('');
  const [negotiatedFare, setNegotiatedFare] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [bids, setBids] = useState<RideBid[]>([]);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);
  const [acceptedBid, setAcceptedBid] = useState<AcceptedBid | null>(null);
  const [finalFare, setFinalFare] = useState<number | null>(null);
  const [showTripPopup, setShowTripPopup] = useState(false);
  const [toast, setToast] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const bidChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tripChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const formValid = Boolean(name.trim() && phone.trim());
  const locationValid = Boolean(pickup.trim() && dropoff.trim());
  const provinceOptions = useMemo(() => provinceNames.map((p) => ({ value: p, label: p })), []);
  const cityOptions = useMemo(
    () => (province ? (egyptProvinces[province] || []).map((c) => ({ value: c, label: c })) : []),
    [province],
  );

  const pricing = usePricingSettings();
  const selectedVehicleType = vehicleTypes.find((v) => v.id === selectedVehicle) ?? null;
  const planner = useTripPlanner({
    pickupText: pickup,
    dropoffText: dropoff,
    setPickupText: setPickup,
    setDropoffText: setDropoff,
    vehicle: selectedVehicleType,
    pricing,
  });
  const distance = planner.route ? Math.round(planner.route.distanceKm * 10) / 10 : null;

  useEffect(() => {
    setSuggestedFare(planner.fare !== null ? String(planner.fare) : '');
  }, [planner.fare]);

  useEffect(() => {
    if (!phone.trim()) return;
    isCustomerNew(phone.trim()).then(setIsNewCustomer).catch(() => setIsNewCustomer(false));
  }, [phone]);

  // Clean up realtime channels on unmount
  useEffect(() => {
    return () => {
      if (bidChannelRef.current) supabase.removeChannel(bidChannelRef.current);
      if (tripChannelRef.current) supabase.removeChannel(tripChannelRef.current);
    };
  }, []);

  // Subscribe to real-time bids when searching
  useEffect(() => {
    if (phase !== 'searching' || !pendingTripId) return;

    // Initial fetch of existing bids
    listBidsForTrip(pendingTripId).then(setBids).catch(() => {});

    const channel = supabase
      .channel(`ride-bids-${pendingTripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_bids' }, (payload) => {
        const newRow = payload.new as { trip_id: string; status: string };
        if (newRow.trip_id !== pendingTripId) return;
        listBidsForTrip(pendingTripId).then(setBids).catch(() => {});
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_bids' }, (payload) => {
        const newRow = payload.new as { trip_id: string; status: string };
        if (newRow.trip_id !== pendingTripId) return;
        listBidsForTrip(pendingTripId).then(setBids).catch(() => {});
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips' }, (payload) => {
        const newRow = payload.new as { id: string; status: string };
        if (newRow.id !== pendingTripId) return;
        if (newRow.status === 'cancelled') {
          setPhase('cancelled');
          if (bidChannelRef.current) supabase.removeChannel(bidChannelRef.current);
        }
      })
      .subscribe();

    bidChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      bidChannelRef.current = null;
    };
  }, [phase, pendingTripId]);

  // Monitor trip status when enroute
  useEffect(() => {
    if (phase !== 'enroute' || !pendingTripId) return;

    const channel = supabase
      .channel(`trip-status-${pendingTripId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips' }, (payload) => {
        const newRow = payload.new as { id: string; status: string };
        if (newRow.id !== pendingTripId) return;
        if (newRow.status === 'completed') {
          setShowTripPopup(true);
        }
      })
      .subscribe();

    tripChannelRef.current = channel;

    // Also poll as fallback in case realtime misses
    const interval = setInterval(async () => {
      const trip = await getTripById(pendingTripId).catch(() => null);
      if (trip?.status === 'completed') {
        setShowTripPopup(true);
        clearInterval(interval);
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      tripChannelRef.current = null;
      clearInterval(interval);
    };
  }, [phase, pendingTripId]);

  const ADMIN_SECRET_CODE = '*#1234#';

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === ADMIN_SECRET_CODE) {
      setName('');
      setScreen('admin');
      return;
    }
    setName(value);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleConfirm = async () => {
    if (!formValid || !province || !city || !locationValid || !selectedVehicle) return;
    if (!planner.pickupPoint) {
      showToast('حدد مكان الركوب على الخريطة أولاً');
      return;
    }

    addClient({ name, phone, province, city });
    const clientOffer = parseInt(negotiatedFare) || parseInt(suggestedFare) || 0;
    const suggestedFareNum = planner.fare;

    try {
      const tripId = await createPendingTrip({
        clientName: name.trim(),
        clientPhone: phone.trim(),
        province,
        city,
        pickup: pickup.trim(),
        dropoff: dropoff.trim(),
        distanceKm: distance,
        clientOffer,
        suggestedFare: suggestedFareNum,
        pickupLat: planner.pickupPoint.lat,
        pickupLng: planner.pickupPoint.lng,
        vehicleType: selectedVehicle,
      });
      setPendingTripId(tripId);
      setPhase('searching');
      showToast('تم إرسال طلبك للكباتن القريبين');
    } catch (error) {
      console.error('[ClientPage handleConfirm] Failed to create pending trip:', {
        error,
        payload: {
          clientName: name.trim(),
          clientPhone: phone.trim(),
          province,
          city,
          pickup: pickup.trim(),
          dropoff: dropoff.trim(),
          distanceKm: distance,
          clientOffer,
          suggestedFare: suggestedFareNum,
          pickupLat: planner.pickupPoint?.lat ?? null,
          pickupLng: planner.pickupPoint?.lng ?? null,
          vehicleType: selectedVehicle,
        },
      });
      showToast(getApiErrorMessage(error, 'تعذر إرسال الطلب، حاول مرة أخرى'));
    }
  };

  const handleCancelSearch = async () => {
    if (!pendingTripId) return;
    setCancelling(true);
    try {
      await cancelPendingTrip(pendingTripId);
      if (bidChannelRef.current) {
        supabase.removeChannel(bidChannelRef.current);
        bidChannelRef.current = null;
      }
      setPhase('cancelled');
      setPendingTripId(null);
      setBids([]);
    } catch {
      showToast('تعذر إلغاء الطلب');
    } finally {
      setCancelling(false);
    }
  };

  const handleRestartFromCancelled = () => {
    setPhase('form');
    setBids([]);
    setPendingTripId(null);
  };

  const handleAcceptBid = async (bid: RideBid) => {
    if (!pendingTripId) return;
    const fare = bid.offerAmount;
    try {
      await acceptBidAndAssignDriver(pendingTripId, bid.id, bid.driverId, fare);
    } catch (error) {
      showToast(getApiErrorMessage(error, 'تعذر تأكيد قبول العرض، حاول مرة أخرى'));
      return;
    }
    if (bidChannelRef.current) {
      supabase.removeChannel(bidChannelRef.current);
      bidChannelRef.current = null;
    }
    setFinalFare(fare);
    setAcceptedBid({
      id: bid.id,
      driverName: bid.driverName,
      vehicle: bid.vehicleType,
      offer: fare,
    });
    const cashToPay = isNewCustomer ? Math.round(fare / 2) : fare;
    setCashPayable(cashToPay);
    addNegotiation({
      clientName: name,
      driverName: bid.driverName,
      clientOffer: parseInt(negotiatedFare) || parseInt(suggestedFare) || 0,
      driverOffer: bid.offerAmount,
      finalFare: fare,
      status: 'agreed',
    });
    showToast(`تم الاتفاق على مبلغ ${fare} جنيه`);
    setPhase('enroute');
  };

  const [cashPayable, setCashPayable] = useState<number | null>(null);

  const handleTripEnd = () => {
    setShowTripPopup(false);
    setScreen('exit');
  };

  const handleReportDispute = () => {
    addDispute({
      clientName: name,
      driverName: acceptedBid?.driverName ?? 'كابتن',
      issue: 'مشكلة أثناء الرحلة',
    });
    showToast('تم إرسال البلاغ للإدارة');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SupportTopBar from={name || 'عميل جديد'} role="client" />
      <div className="sticky top-0 z-30 bg-gradient-to-l from-navy-800 to-navy-900 px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (phase === 'searching' && pendingTripId) {
                void handleCancelSearch();
              } else {
                setScreen('role');
              }
            }}
            className="flex items-center gap-1 text-white/80 transition-colors hover:text-white"
          >
            <ArrowRight size={20} />
            <span className="text-sm">رجوع</span>
          </button>
          <h1 className="text-lg font-bold text-white">صفحة العميل</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-6">
        {phase === 'form' && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
                <User size={20} className="text-brand-500" />
                بيانات العميل
              </h3>
              <div className="space-y-3">
                <TextField
                  label="الاسم"
                  placeholder="اكتب اسمك"
                  value={name}
                  onChange={handleNameChange}
                  icon={<User size={18} />}
                />
                <TextField
                  label="رقم التليفون"
                  placeholder="01xxxxxxxxx"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  icon={<Phone size={18} />}
                />
              </div>
            </div>

            {formValid && (
              <div className="animate-slide-up rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
                  <MapPin size={20} className="text-brand-500" />
                  الموقع
                </h3>
                <div className="space-y-3">
                  <SelectField
                    label="المحافظة"
                    value={province}
                    onChange={(v) => {
                      setProvince(v);
                      setCity('');
                    }}
                    options={provinceOptions}
                    placeholder="اختر المحافظة"
                    icon={<MapPin size={18} />}
                  />
                  <SelectField
                    label="المركز / المنطقة"
                    value={city}
                    onChange={setCity}
                    options={cityOptions}
                    placeholder="اختر المركز"
                    disabled={!province}
                  />
                </div>
              </div>
            )}

            {formValid && province && (
              <div className="animate-slide-up rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
                  <Navigation size={20} className="text-brand-500" />
                  تفاصيل الرحلة
                </h3>
                <div className="space-y-3">
                  <AddressAutocomplete
                    label="مكان الركوب"
                    placeholder="اكتب مكان الركوب"
                    value={pickup}
                    onChange={setPickup}
                    onSuggestionSelect={(s) => planner.setPointFromSuggestion('pickup', s)}
                    icon={<MapPin size={18} />}
                  />
                  <AddressAutocomplete
                    label="مكان الوصول"
                    placeholder="اكتب مكان الوصول"
                    value={dropoff}
                    onChange={setDropoff}
                    onSuggestionSelect={(s) => planner.setPointFromSuggestion('dropoff', s)}
                    icon={<Navigation size={18} />}
                  />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="المبلغ المقترح (جنيه)"
                    placeholder="تلقائي"
                    type="number"
                    readOnly
                    value={suggestedFare}
                    icon={<DollarSign size={18} />}
                  />
                  <TextField
                    label="عرض السعر (جنيه)"
                    placeholder="اكتب سعر مختلف"
                    type="number"
                    value={negotiatedFare}
                    onChange={(e) => setNegotiatedFare(e.target.value)}
                    icon={<Handshake size={18} />}
                  />
                </div>
                </div>
              </div>
            )}

            {formValid && province && (
              <div className="animate-slide-up rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-navy-800">
                  <Truck size={20} className="text-brand-500" />
                  نوع المركبة
                </h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {vehicleTypes.map((v) => {
                    const Icon = v.icon;
                    const selected = selectedVehicle === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVehicle(v.id)}
                        className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all active:scale-95 ${
                          selected
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                            : 'border-gray-200 bg-white hover:border-brand-300'
                        }`}
                      >
                        <Icon
                          size={28}
                          className={selected ? 'text-brand-500' : 'text-navy-400'}
                        />
                        <span className={`text-xs font-semibold ${selected ? 'text-brand-600' : 'text-navy-600'}`}>
                          {v.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {formValid && province && (
              <div className="animate-slide-up overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-3">
                  <h3 className="flex items-center gap-2 font-bold text-navy-800">
                    <MapPin size={20} className="text-brand-500" />
                    الخريطة
                  </h3>
                </div>
                <div className="p-4">
                  <TripMap
                    pickup={planner.pickupPoint}
                    dropoff={planner.dropoffPoint}
                    route={planner.route}
                    routing={planner.routing}
                    routeError={planner.routeError}
                    pickMode={planner.pickMode}
                    onPickModeChange={planner.setPickMode}
                    onMapPick={planner.handleMapPick}
                  />
                </div>
              </div>
            )}

            {formValid && province && locationValid && selectedVehicle && (
              <div className="animate-slide-up">
                <Button variant="primary" size="lg" fullWidth onClick={handleConfirm}>
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 size={22} />
                    تأكيد الطلب
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === 'searching' && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Handshake className="text-brand-500" size={24} />
                  <h2 className="text-xl font-extrabold text-navy-800">في انتظار عروض الكباتن</h2>
                </div>
                <button
                  onClick={handleCancelSearch}
                  disabled={cancelling}
                  className="flex items-center gap-1 rounded-lg bg-error-50 px-3 py-1.5 text-sm font-semibold text-error-600 transition-colors hover:bg-error-100"
                >
                  <XCircle size={16} />
                  {cancelling ? '...' : 'إلغاء'}
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-brand-50 p-3 text-center">
                  <p className="text-xs text-navy-500">عرضك</p>
                  <p className="text-2xl font-extrabold text-brand-600">{negotiatedFare || suggestedFare || 0}</p>
                  <p className="text-xs text-navy-400">جنيه</p>
                </div>
                <div className="rounded-xl bg-navy-50 p-3 text-center">
                  <p className="text-xs text-navy-500">عروض الكابتن</p>
                  <p className="text-2xl font-extrabold text-navy-700">{bids.length}</p>
                  <p className="text-xs text-navy-400">وصلت</p>
                </div>
              </div>

              <div className="space-y-3">
                {bids.length === 0 && (
                  <div className="flex flex-col items-center py-6 text-navy-400">
                    <Clock className="animate-pulse-soft" size={32} />
                    <p className="mt-2 text-sm">جاري البحث عن كباتن قريبين منك...</p>
                  </div>
                )}
                {bids.map((bid) => (
                  <div
                    key={bid.id}
                    className="animate-slide-in-right rounded-xl border-2 border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-navy-800">{bid.driverName}</p>
                        <p className="text-xs text-navy-400">{bid.vehicleType}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-2xl font-extrabold text-brand-600">{bid.offerAmount}</p>
                        <p className="text-xs text-navy-400">جنيه</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="success" size="sm" className="flex-1" onClick={() => handleAcceptBid(bid)}>
                        قبول
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleReportDispute}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-error-50 py-3 text-sm font-semibold text-error-600 transition-colors hover:bg-error-100"
            >
              <Flag size={18} />
              الإبلاغ عن مشكلة
            </button>
          </div>
        )}

        {phase === 'cancelled' && (
          <div className="flex flex-col items-center justify-center py-20 animate-scale-in">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-error-100 shadow-xl">
              <XCircle className="text-error-500" size={48} />
            </div>
            <h2 className="mt-6 text-2xl font-extrabold text-navy-800">تم إلغاء الطلب</h2>
            <p className="mt-2 text-navy-500">يمكنك إرسال طلب جديد في أي وقت</p>
            <Button variant="primary" size="md" className="mt-6" onClick={handleRestartFromCancelled}>
              طلب جديد
            </Button>
          </div>
        )}

        {phase === 'enroute' && (
          <div className="space-y-4 animate-fade-in">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="bg-gradient-to-l from-success-500 to-success-600 px-5 py-4">
                <div className="flex items-center gap-2 text-white">
                  <Truck className="animate-bounce-sm" size={24} />
                  <span className="text-lg font-bold">الكابتن في الطريق إليك</span>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-navy-500">الكابتن</span>
                  <span className="font-bold text-navy-800">{acceptedBid?.driverName ?? 'كابتن'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-100 py-3">
                  <span className="text-navy-500">المركبة</span>
                  <span className="font-bold text-navy-800">{acceptedBid?.vehicle ?? '-'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-100 py-3">
                  <span className="text-navy-500">من</span>
                  <span className="font-bold text-navy-800">{pickup}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-100 py-3">
                  <span className="text-navy-500">إلى</span>
                  <span className="font-bold text-navy-800">{dropoff}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-100 py-3">
                  <span className="text-navy-500">السعر المتفق عليه</span>
                  <span className="text-xl font-bold text-navy-700">{finalFare} جنيه</span>
                </div>
                <div className="mt-3 rounded-xl bg-brand-50 p-4">
                  <div className="flex items-center gap-2 text-brand-600">
                    <DollarSign size={20} />
                    <span className="text-sm font-semibold">المبلغ المطلوب سداده كاش للكابتن</span>
                  </div>
                  <p className="mt-1 text-3xl font-extrabold text-brand-600">
                    {cashPayable ?? finalFare} جنيه
                  </p>
                  {isNewCustomer && (
                    <p className="mt-2 rounded-lg bg-success-100 px-3 py-1.5 text-xs font-bold text-success-700">
                      خصم عميل جديد 50% — اتدفع نص المشوار بس
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-2 flex justify-between text-sm font-semibold text-navy-600">
                <span>تقدم الرحلة</span>
                <span className="text-brand-500">جاري التوصيل...</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-600"
                  style={{ animation: 'shimmer 4s linear forwards', width: '100%' }}
                />
              </div>
              <p className="mt-3 text-center text-sm text-navy-400">
                سيتم سؤالك عن حالة الوصول عند انتهاء الرحلة
              </p>
            </div>
          </div>
        )}
      </div>

      {showTripPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="mx-6 w-full max-w-sm animate-pop rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
              <AlertCircle className="text-brand-500" size={32} />
            </div>
            <h3 className="text-2xl font-extrabold text-navy-800">وصلت ولا لسه؟</h3>
            <p className="mt-2 text-sm text-navy-500">اكد لنا حالة الرحلة الحالية</p>
            <div className="mt-6 flex gap-3">
              <Button variant="success" size="lg" fullWidth onClick={handleTripEnd}>
                وصلت
              </Button>
              <Button variant="outline" size="lg" fullWidth onClick={() => setShowTripPopup(false)}>
                لسه
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-2xl bg-navy-900 px-6 py-3 shadow-xl">
          <p className="font-semibold text-white">{toast}</p>
        </div>
      )}
    </div>
  );
}
