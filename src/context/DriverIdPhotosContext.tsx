import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getDriverIdPhotoUrl } from '@/lib/adminApi';

export type PhotoSide = 'front' | 'back';

export type PhotoState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  url: string | null;
};

type DriverPhotoPaths = {
  id: string;
  idFrontPath: string | null;
  idBackPath: string | null;
};

type DriverIdPhotosValue = {
  getPhoto: (driverId: string, side: PhotoSide) => PhotoState;
  requestPhotos: (driver: DriverPhotoPaths) => void;
  retryPhoto: (driver: DriverPhotoPaths, side: PhotoSide) => void;
};

const IDLE_PHOTO: PhotoState = { status: 'idle', url: null };

const DriverIdPhotosContext = createContext<DriverIdPhotosValue | null>(null);

const photoKey = (driverId: string, side: PhotoSide) => `${driverId}:${side}`;

const pathFor = (driver: DriverPhotoPaths, side: PhotoSide) =>
  side === 'front' ? driver.idFrontPath : driver.idBackPath;

export function DriverIdPhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Record<string, PhotoState>>({});

  const setPhoto = useCallback((key: string, state: PhotoState) => {
    setPhotos((prev) => ({ ...prev, [key]: state }));
  }, []);

  const fetchPhoto = useCallback(
    async (driverId: string, side: PhotoSide, path: string) => {
      const key = photoKey(driverId, side);
      setPhoto(key, { status: 'loading', url: null });
      try {
        const url = await getDriverIdPhotoUrl(path);
        setPhoto(key, { status: 'ready', url });
      } catch {
        setPhoto(key, { status: 'error', url: null });
      }
    },
    [setPhoto],
  );

  const getPhoto = useCallback(
    (driverId: string, side: PhotoSide) => photos[photoKey(driverId, side)] ?? IDLE_PHOTO,
    [photos],
  );

  const requestPhotos = useCallback(
    (driver: DriverPhotoPaths) => {
      for (const side of ['front', 'back'] as const) {
        const path = pathFor(driver, side);
        const current = photos[photoKey(driver.id, side)];
        if (!path || current?.status === 'loading' || current?.status === 'ready') continue;
        void fetchPhoto(driver.id, side, path);
      }
    },
    [photos, fetchPhoto],
  );

  const retryPhoto = useCallback(
    (driver: DriverPhotoPaths, side: PhotoSide) => {
      const path = pathFor(driver, side);
      if (!path) return;
      void fetchPhoto(driver.id, side, path);
    },
    [fetchPhoto],
  );

  const value = useMemo(
    () => ({ getPhoto, requestPhotos, retryPhoto }),
    [getPhoto, requestPhotos, retryPhoto],
  );

  return <DriverIdPhotosContext.Provider value={value}>{children}</DriverIdPhotosContext.Provider>;
}

export function useDriverIdPhotos(): DriverIdPhotosValue {
  const ctx = useContext(DriverIdPhotosContext);
  if (!ctx) throw new Error('useDriverIdPhotos must be used within DriverIdPhotosProvider');
  return ctx;
}
