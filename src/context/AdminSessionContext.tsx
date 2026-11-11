import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isCurrentUserAdmin } from '@/lib/adminApi';

type AdminSessionValue = {
  checking: boolean;
  isAdmin: boolean;
  adminEmail: string | null;
  signOutAdmin: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = async (next: Session | null) => {
      const admin = next ? await isCurrentUserAdmin().catch(() => false) : false;
      if (!active) return;
      setSession(next);
      setIsAdmin(admin);
      setChecking(false);
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AdminSessionValue>(
    () => ({
      checking,
      isAdmin,
      adminEmail: isAdmin ? (session?.user.email ?? null) : null,
      signOutAdmin: async () => {
        await supabase.auth.signOut();
      },
    }),
    [checking, isAdmin, session],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used within AdminSessionProvider');
  return ctx;
}
