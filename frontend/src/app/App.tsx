import { BrowserRouter, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { ShopProvider } from '../contexts/ShopContext';
import { AppRoutes } from '../routes/AppRoutes';
import { NotificationCenterProvider } from '../components/NotificationCenter';
import { ApiErrorRedirector } from './ApiErrorRedirector';
import { AppErrorBoundary } from './AppErrorBoundary';

function RoutedApp() {
  const location = useLocation();

  return (
    <>
      <ApiErrorRedirector />
      <NotificationCenterProvider>
        <ShopProvider>
          <AppErrorBoundary
            key={location.pathname === '/tin-tuc' ? location.pathname : location.key}
          >
            <Suspense
              fallback={
                <main className="section" role="status">
                  Đang mở trang…
                </main>
              }
            >
              <AppRoutes />
            </Suspense>
          </AppErrorBoundary>
        </ShopProvider>
      </NotificationCenterProvider>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}
