import { useState } from 'react';
import {
  ArrowRight,
  Users,
  Car,
  ScrollText,
  Headphones,
  Phone,
  MessageCircle,
  Check,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Wallet,
  ReceiptText,
  Route,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { SupportTopBar } from '@/components/SupportTopBar';
import { useDrivers } from '@/hooks/useDrivers';
import { DriversTab } from '@/screens/admin/DriversTab';
import { WalletTab } from '@/screens/admin/WalletTab';
import { PaymentProofsTab } from '@/screens/admin/PaymentProofsTab';
import { PaymentSettingsTab } from '@/screens/admin/PaymentSettingsTab';
import { TripsTab } from '@/screens/admin/TripsTab';
import { AdminManagementTab } from '@/screens/admin/AdminManagementTab';
import { PricingSettingsCard } from '@/screens/admin/PricingSettingsCard';
import { SubscriptionPriceCard } from '@/screens/admin/SubscriptionPriceCard';

type Tab = 'clients' | 'drivers' | 'wallet' | 'proofs' | 'trips' | 'settings' | 'logs' | 'support';

export function AdminPanel() {
  const { setScreen, clients, negotiations, disputes, supportRequests, resolveDispute, closeSupport } = useApp();
  const { drivers, loading: driversLoading, error: driversError, reload: reloadDrivers } = useDrivers();
  const [tab, setTab] = useState<Tab>('clients');
  const [showAdminManagement, setShowAdminManagement] = useState(false);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'clients', label: 'العملاء', icon: Users },
    { id: 'drivers', label: 'الكباتن', icon: Car },
    { id: 'wallet', label: 'المحافظ', icon: Wallet },
    { id: 'proofs', label: 'التحويلات', icon: ReceiptText },
    { id: 'trips', label: 'الرحلات', icon: Route },
    { id: 'settings', label: 'الحسابات', icon: Landmark },
    { id: 'logs', label: 'السجلات', icon: ScrollText },
    { id: 'support', label: 'الدعم', icon: Headphones },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <SupportTopBar />
      <div className="sticky top-0 z-30 bg-navy-900 px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setScreen('role')}
            className="flex items-center gap-1 text-white/80 transition-colors hover:text-white"
          >
            <ArrowRight size={20} />
            <span className="text-sm">خروج</span>
          </button>
          <h1 className="text-lg font-bold text-white">لوحة الإدارة</h1>
          <button
            onClick={() => setShowAdminManagement((open) => !open)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${
              showAdminManagement ? 'bg-brand-500 text-white' : 'bg-navy-800 text-navy-200 hover:bg-navy-700'
            }`}
          >
            <ShieldCheck size={14} />
            المديرين
          </button>
        </div>
      </div>

      {showAdminManagement ? (
        <div className="mx-auto max-w-md px-4 py-4">
          <button
            onClick={() => setShowAdminManagement(false)}
            className="mb-4 flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white"
          >
            <ArrowRight size={16} />
            <span>رجوع للوحة</span>
          </button>
          <AdminManagementTab />
        </div>
      ) : (
      <>
      <div className="grid grid-cols-4 gap-2 bg-navy-900 px-4 py-3">
        <div className="rounded-xl bg-navy-800 p-2 text-center">
          <p className="text-2xl font-extrabold text-brand-400">{clients.length}</p>
          <p className="text-xs text-navy-300">عميل</p>
        </div>
        <div className="rounded-xl bg-navy-800 p-2 text-center">
          <p className="text-2xl font-extrabold text-brand-400">{drivers.length}</p>
          <p className="text-xs text-navy-300">كابتن</p>
        </div>
        <div className="rounded-xl bg-navy-800 p-2 text-center">
          <p className="text-2xl font-extrabold text-brand-400">{negotiations.length}</p>
          <p className="text-xs text-navy-300">اتفاق</p>
        </div>
        <div className="rounded-xl bg-navy-800 p-2 text-center">
          <p className="text-2xl font-extrabold text-error-400">{disputes.filter((d) => !d.resolved).length}</p>
          <p className="text-xs text-navy-300">نزاع</p>
        </div>
      </div>

      <div className="sticky top-[57px] z-20 flex gap-1 overflow-x-auto bg-navy-900 px-2 py-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-all ${
                active ? 'bg-brand-500 text-white' : 'text-navy-300 hover:bg-navy-800'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto max-w-md px-4 py-4">
        {tab === 'clients' && <ClientsTab clients={clients} />}
        {tab === 'drivers' && (
          <DriversTab drivers={drivers} loading={driversLoading} error={driversError} onChanged={reloadDrivers} />
        )}
        {tab === 'wallet' && <WalletTab drivers={drivers} onChanged={reloadDrivers} />}
        {tab === 'proofs' && <PaymentProofsTab />}
        {tab === 'trips' && <TripsTab />}
        {tab === 'settings' && (
          <div className="space-y-4">
            <PricingSettingsCard />
            <SubscriptionPriceCard />
            <PaymentSettingsTab />
          </div>
        )}
        {tab === 'logs' && <LogsTab negotiations={negotiations} disputes={disputes} onResolve={resolveDispute} />}
        {tab === 'support' && <SupportTab requests={supportRequests} onClose={closeSupport} />}
      </div>
      </>
      )}
    </div>
  );
}

/* ---------- Clients Tab ---------- */
function ClientsTab({ clients }: { clients: ReturnType<typeof useApp>['clients'] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Users size={20} className="text-brand-400" />
        <h2 className="font-bold">بيانات العملاء</h2>
        <span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs text-navy-300">{clients.length} عميل</span>
      </div>

      {clients.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-2xl bg-navy-800">
          <button
            onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            className="flex w-full items-center justify-between p-4 text-right"
          >
            <div>
              <p className="font-bold text-white">{c.name}</p>
              <p className="text-sm text-navy-300">{c.phone}</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-navy-400">{c.province}</p>
              <p className="text-xs text-navy-400">{c.city}</p>
            </div>
          </button>

          {expanded === c.id && (
            <div className="border-t border-navy-700 bg-navy-900/50 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-400">
                <MapPin size={16} /> سجل الرحلات
              </h4>
              {c.tripHistory.length === 0 ? (
                <p className="text-sm text-navy-400">لا توجد رحلات سابقة</p>
              ) : (
                <div className="space-y-2">
                  {c.tripHistory.map((t, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-navy-900 p-2.5">
                      <div>
                        <p className="text-sm font-semibold text-white">{t.destination}</p>
                        <p className="text-xs text-navy-400">{t.date}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-brand-400">{t.fare} ج</p>
                        <span className="rounded-full bg-success-500/20 px-2 py-0.5 text-xs text-success-400">
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Logs Tab ---------- */
function LogsTab({
  negotiations,
  disputes,
  onResolve,
}: {
  negotiations: ReturnType<typeof useApp>['negotiations'];
  disputes: ReturnType<typeof useApp>['disputes'];
  onResolve: (id: string) => void;
}) {
  const [view, setView] = useState<'negotiations' | 'disputes'>('negotiations');

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <ScrollText size={20} className="text-brand-400" />
        <h2 className="font-bold">السجلات والنزاعات</h2>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setView('negotiations')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all ${
            view === 'negotiations' ? 'bg-brand-500 text-white' : 'bg-navy-800 text-navy-300'
          }`}
        >
          اتفاقيات الأسعار
        </button>
        <button
          onClick={() => setView('disputes')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all ${
            view === 'disputes' ? 'bg-brand-500 text-white' : 'bg-navy-800 text-navy-300'
          }`}
        >
          النزاعات والمشاكل
        </button>
      </div>

      {view === 'negotiations' && (
        <div className="space-y-2">
          {negotiations.map((n) => (
            <div key={n.id} className="rounded-2xl bg-navy-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{n.clientName} ← {n.driverName}</p>
                  <p className="text-xs text-navy-400">{n.timestamp}</p>
                </div>
                <CheckCircle2 className="text-success-400" size={20} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-navy-700 pt-3">
                <div className="text-center">
                  <p className="text-xs text-navy-400">عرض العميل</p>
                  <p className="font-bold text-navy-200">{n.clientOffer} ج</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-navy-400">عرض الكابتن</p>
                  <p className="font-bold text-navy-200">{n.driverOffer} ج</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-navy-400">السعر النهائي</p>
                  <p className="font-bold text-brand-400">{n.finalFare} ج</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'disputes' && (
        <div className="space-y-2">
          {disputes.length === 0 && (
            <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
              <AlertTriangle className="mx-auto mb-2" size={32} />
              <p>لا توجد نزاعات حالية</p>
            </div>
          )}
          {disputes.map((d) => (
            <div key={d.id} className="rounded-2xl bg-navy-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{d.clientName} ← {d.driverName}</p>
                  <p className="mt-1 text-sm text-navy-300">{d.issue}</p>
                  <p className="mt-1 text-xs text-navy-400">{d.timestamp}</p>
                </div>
                {d.resolved ? (
                  <span className="shrink-0 rounded-full bg-success-500/20 px-2.5 py-1 text-xs font-semibold text-success-400">
                    تم الحل
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-error-500/20 px-2.5 py-1 text-xs font-semibold text-error-400">
                    غير محلول
                  </span>
                )}
              </div>
              {!d.resolved && (
                <Button variant="success" size="sm" fullWidth className="mt-3" onClick={() => onResolve(d.id)}>
                  <span className="flex items-center justify-center gap-1">
                    <Check size={16} /> تحديد كمحلول
                  </span>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Support Tab ---------- */
function SupportTab({
  requests,
  onClose,
}: {
  requests: ReturnType<typeof useApp>['supportRequests'];
  onClose: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all');

  const filtered = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-white/80">
        <Headphones size={20} className="text-brand-400" />
        <h2 className="font-bold">مركز الدعم</h2>
      </div>

      <div className="flex gap-2">
        {(['all', 'active', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-navy-800 text-navy-300'
            }`}
          >
            <Filter size={12} />
            {f === 'all' ? 'الكل' : f === 'active' ? 'نشط' : 'قيد الانتظار'}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-navy-800 p-6 text-center text-navy-400">
          <Headphones className="mx-auto mb-2" size={32} />
          <p>لا توجد طلبات دعم</p>
        </div>
      )}

      {filtered.map((r) => (
        <div key={r.id} className="rounded-2xl bg-navy-800 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  r.type === 'chat' ? 'bg-brand-500/20' : 'bg-navy-600'
                }`}
              >
                {r.type === 'chat' ? (
                  <MessageCircle className="text-brand-400" size={20} />
                ) : (
                  <Phone className="text-navy-200" size={20} />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{r.from}</p>
                <p className="text-xs text-navy-400">
                  {r.role === 'client' ? 'عميل' : 'كابتن'} · {r.type === 'chat' ? 'دردشة' : 'مكالمة'}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                r.status === 'active'
                  ? 'bg-success-500/20 text-success-400'
                  : r.status === 'pending'
                    ? 'bg-warning-500/20 text-warning-400'
                    : 'bg-navy-700 text-navy-400'
              }`}
            >
              {r.status === 'active' ? 'نشط' : r.status === 'pending' ? 'منتظر' : 'مغلق'}
            </span>
          </div>

          <p className="mt-3 rounded-lg bg-navy-900 p-2.5 text-sm text-navy-200">{r.message}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-navy-400">
              <Clock size={12} /> {r.timestamp}
            </span>
            {r.status !== 'closed' && (
              <Button variant="ghost" size="sm" onClick={() => onClose(r.id)} className="text-navy-300 hover:text-white">
                إغلاق الطلب
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
