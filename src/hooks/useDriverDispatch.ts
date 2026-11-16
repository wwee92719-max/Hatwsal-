import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { listPendingTripsForDriver, submitBid, type Trip } from '@/lib/api';

const GPS_UPDATE_INTERVAL_MS = 10000;
const ALERT_BEEP_DURATION_MS = 600;

function playAlertBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + ALERT_BEEP_DURATION_MS / 1000);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + ALERT_BEEP_DURATION_MS / 1000);
  } catch {
    // AudioContext may not be available — silent fallback
  }
}

export function requestNotificationPermission(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

function firePushNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      tag: 'new-ride-request',
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers throw if the page is not focused — ignore
  }
}

export function useDriverGps(driverId: string, isOnline: boolean) {
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOnline) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('المتصفح لا يدعم تحديد الموقع');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentPos({ lat, lng });
        setGpsError('');
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'تم رفض إذن تحديد الموقع — فعّله لاستقبال الطلبات'
            : 'تعذر تحديد موقعك الحالي'
        );
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline]);

  const uploadLocation = useCallback(async () => {
    if (!currentPos) return;
    try {
      await supabase
        .from('drivers')
        .update({ latitude: currentPos.lat, longitude: currentPos.lng })
        .eq('id', driverId);
    } catch {
      // silent — will retry next interval
    }
  }, [driverId, currentPos]);

  useEffect(() => {
    if (!isOnline || !currentPos) return;
    void uploadLocation();
    const interval = setInterval(uploadLocation, GPS_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOnline, currentPos, uploadLocation]);

  return { currentPos, gpsError };
}

export type IncomingRequest = Trip & {
  pickupLat: number;
  pickupLng: number;
  suggestedFare: number | null;
  clientOffer: number;
};

export function useIncomingRequests(driverId: string, isOnline: boolean, canReceiveRequests: boolean) {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [biddingTripId, setBiddingTripId] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);
  const [alertRequest, setAlertRequest] = useState<IncomingRequest | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const prevRequestIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!isOnline || !canReceiveRequests) {
      setRequests([]);
      return;
    }
    try {
      const trips = await listPendingTripsForDriver(driverId);
      const newRequests = trips as IncomingRequest[];
      setRequests(newRequests);

      // Detect newly arrived requests for audio alert + modal
      const currentIds = new Set(newRequests.map((r) => r.id));
      const newlyArrived = newRequests.filter(
        (r) => !prevRequestIdsRef.current.has(r.id) && !dismissedAlertIds.has(r.id)
      );
      if (newlyArrived.length > 0) {
        const first = newlyArrived[0];
        playAlertBeep();
        setAlertRequest(first);
        firePushNotification(
          'طلب رحلة جديد!',
          `${first.clientName} — ${first.pickup} إلى ${first.dropoff}`,
        );
      }
      prevRequestIdsRef.current = currentIds;
    } catch {
      // silent — will retry
    }
  }, [driverId, isOnline, canReceiveRequests, dismissedAlertIds]);

  useEffect(() => {
    refresh();
    if (!isOnline || !canReceiveRequests) {
      prevRequestIdsRef.current = new Set();
      return;
    }

    const channel = supabase
      .channel('pending-trips-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips' }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips' }, () => refresh())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trips' }, () => refresh())
      .subscribe();

    const interval = setInterval(refresh, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refresh, isOnline, canReceiveRequests]);

  const dismissAlert = useCallback((tripId: string) => {
    setAlertRequest(null);
    setDismissedAlertIds((prev) => new Set(prev).add(tripId));
  }, []);

  const handleSubmitBid = useCallback(
    async (tripId: string, driverId: string, amount: number) => {
      setSubmittingBid(true);
      try {
        await submitBid(tripId, driverId, amount);
        setBiddingTripId(null);
        setBidAmount('');
        dismissAlert(tripId);
      } finally {
        setSubmittingBid(false);
      }
    },
    [dismissAlert]
  );

  return {
    requests,
    biddingTripId,
    setBiddingTripId,
    bidAmount,
    setBidAmount,
    submittingBid,
    handleSubmitBid,
    refreshRequests: refresh,
    alertRequest,
    dismissAlert,
  };
}
