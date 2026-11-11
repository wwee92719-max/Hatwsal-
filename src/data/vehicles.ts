import {
  Bike,
  Truck,
  Car,
  BusFront,
  Package,
  CarTaxiFront,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type VehicleType = {
  id: string;
  name: string;
  icon: LucideIcon;
  baseFare: number;
  perKm: number;
  perMinute: number;
};

export const vehicleTypes: VehicleType[] = [
  { id: 'bicycle', name: 'دراجة', icon: Bike, baseFare: 10, perKm: 2, perMinute: 0.4 },
  { id: 'motorcycle', name: 'موتوسيكل', icon: Bike, baseFare: 15, perKm: 3, perMinute: 0.5 },
  { id: 'tuktuk', name: 'توكتوك', icon: CarTaxiFront, baseFare: 20, perKm: 3.5, perMinute: 0.6 },
  { id: 'tricycle', name: 'تروسيكل', icon: Package, baseFare: 25, perKm: 4, perMinute: 0.75 },
  { id: 'car', name: 'عربية عادية', icon: Car, baseFare: 30, perKm: 6, perMinute: 1 },
  { id: 'minibus', name: 'ميكروباص', icon: BusFront, baseFare: 40, perKm: 7, perMinute: 1.25 },
  { id: 'truck', name: 'عربية نقل', icon: Truck, baseFare: 60, perKm: 10, perMinute: 1.5 },
];
