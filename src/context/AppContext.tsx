import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  ClientRecord,
  NegotiationLog,
  DisputeLog,
  SupportRequest,
} from '@/types/records';

type Screen = 'splash' | 'role' | 'client' | 'driver' | 'admin' | 'exit';

type AppContextType = {
  screen: Screen;
  setScreen: (s: Screen) => void;

  clients: ClientRecord[];
  negotiations: NegotiationLog[];
  disputes: DisputeLog[];
  supportRequests: SupportRequest[];

  addClient: (c: Omit<ClientRecord, 'id' | 'registeredAt' | 'tripHistory'>) => void;
  addNegotiation: (n: Omit<NegotiationLog, 'id' | 'timestamp'>) => void;
  addDispute: (d: Omit<DisputeLog, 'id' | 'timestamp' | 'resolved'>) => void;
  addSupportRequest: (s: Omit<SupportRequest, 'id' | 'timestamp' | 'status'>) => void;
  resolveDispute: (id: string) => void;
  closeSupport: (id: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

let idCounter = 1000;
const nextId = () => `gen-${++idCounter}`;

const now = () => new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('splash');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [negotiations, setNegotiations] = useState<NegotiationLog[]>([]);
  const [disputes, setDisputes] = useState<DisputeLog[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);

  const addClient = useCallback((c: Omit<ClientRecord, 'id' | 'registeredAt' | 'tripHistory'>) => {
    setClients((prev) => [
      { ...c, id: nextId(), registeredAt: new Date().toISOString().slice(0, 10), tripHistory: [] },
      ...prev,
    ]);
  }, []);

  const addNegotiation = useCallback((n: Omit<NegotiationLog, 'id' | 'timestamp'>) => {
    setNegotiations((prev) => [{ ...n, id: nextId(), timestamp: now() }, ...prev]);
  }, []);

  const addDispute = useCallback((d: Omit<DisputeLog, 'id' | 'timestamp' | 'resolved'>) => {
    setDisputes((prev) => [{ ...d, id: nextId(), timestamp: now(), resolved: false }, ...prev]);
  }, []);

  const addSupportRequest = useCallback((s: Omit<SupportRequest, 'id' | 'timestamp' | 'status'>) => {
    setSupportRequests((prev) => [{ ...s, id: nextId(), timestamp: now(), status: 'pending' }, ...prev]);
  }, []);

  const resolveDispute = useCallback((id: string) => {
    setDisputes((prev) => prev.map((d) => (d.id === id ? { ...d, resolved: true } : d)));
  }, []);

  const closeSupport = useCallback((id: string) => {
    setSupportRequests((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'closed' } : s)));
  }, []);

  return (
    <AppContext.Provider
      value={{
        screen,
        setScreen,
        clients,
        negotiations,
        disputes,
        supportRequests,
        addClient,
        addNegotiation,
        addDispute,
        addSupportRequest,
        resolveDispute,
        closeSupport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
