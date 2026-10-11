import { BrowserRouter, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { ShopProvider } from '../contexts/ShopContext';
import { AppRoutes } from '../routes/AppRoutes';
import { NotificationCenterProvider } from '../components/NotificationCenter';
import { ApiErrorRedirector } from './ApiErrorRedirector';
import { AppErrorBoundary } from './AppErrorBoundary';
import { PageLoading } from '../components/PageLoading';

function RoutedApp() {
  const location = useLocation();

  if (/^\/story\/video\/?$/.test(location.pathname)) {
    return (
      <AppErrorBoundary resetKey={location.key}>
        <Suspense fallback={<PageLoading />}>
          <AppRoutes />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  return (
    <>
      <ApiErrorRedirector />
      <NotificationCenterProvider>
        <ShopProvider>
          <AppErrorBoundary
            resetKey={location.pathname === '/tin-tuc' ? location.pathname : location.key}
          >
            <Suspense fallback={<PageLoading />}>
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
