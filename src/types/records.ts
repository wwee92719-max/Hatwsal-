export type ClientRecord = {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  registeredAt: string;
  tripHistory: { destination: string; fare: number; date: string; status: string }[];
};

export type NegotiationLog = {
  id: string;
  clientName: string;
  driverName: string;
  clientOffer: number;
  driverOffer: number;
  finalFare: number;
  timestamp: string;
  status: 'agreed' | 'disputed';
};

export type DisputeLog = {
  id: string;
  clientName: string;
  driverName: string;
  issue: string;
  timestamp: string;
  resolved: boolean;
};

export type SupportRequest = {
  id: string;
  from: string;
  role: 'client' | 'driver';
  type: 'chat' | 'call';
  message: string;
  timestamp: string;
  status: 'pending' | 'active' | 'closed';
};
