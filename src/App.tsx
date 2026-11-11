import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useAdminSession } from '@/context/AdminSessionContext';
import { BANNER_HEIGHT_PX, hideBannerAd, initializeAds, showBannerAd } from '@/lib/admob';
import { SplashScreen } from '@/screens/SplashScreen';
import { RoleSelection } from '@/screens/RoleSelection';
import { ClientPage } from '@/screens/ClientPage';
import { DriverPage } from '@/screens/DriverPage';
import { AdminPanel } from '@/screens/AdminPanel';
import { AdminGmailLogin } from '@/screens/admin/AdminGmailLogin';
import { ExitScreen } from '@/screens/ExitScreen';

const BANNER_SCREENS = new Set(['client', 'driver']);

function AppContent() {
  const { screen } = useApp();
  const { checking, isAdmin } = useAdminSession();
  const showBanner = BANNER_SCREENS.has(screen);

  useEffect(() => {
    void initializeAds();
  }, []);

  useEffect(() => {
    if (showBanner) {
      void showBannerAd();
      return () => {
        void hideBannerAd();
      };
    }
    return undefined;
  }, [showBanner]);

  const content = (() => {
    switch (screen) {
      case 'splash':
        return <SplashScreen />;
      case 'role':
        return <RoleSelection />;
      case 'client':
        return <ClientPage />;
      case 'driver':
        return <DriverPage />;
      case 'admin':
        if (checking) return null;
        return isAdmin ? <AdminPanel /> : <AdminGmailLogin />;
      case 'exit':
        return <ExitScreen />;
      default:
        return <SplashScreen />;
    }
  })();

  return showBanner ? <div style={{ paddingBottom: BANNER_HEIGHT_PX }}>{content}</div> : content;
}

function App() {
  return <AppContent />;
}

export default App;
