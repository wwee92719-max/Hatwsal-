import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from '@/context/AppContext';
import { AdminSessionProvider } from '@/context/AdminSessionContext';
import { DriverIdPhotosProvider } from '@/context/DriverIdPhotosContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <AdminSessionProvider>
        <DriverIdPhotosProvider>
          <App />
        </DriverIdPhotosProvider>
      </AdminSessionProvider>
    </AppProvider>
  </StrictMode>
);
