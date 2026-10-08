import { Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import { Layout } from '../layouts/Layout';
import { Home } from '../pages/Home';
import { Products, ProductDetail } from '../pages/Products';
import { Story, About } from '../pages/Editorial';
import { Contact } from '../pages/Contact';
import { CartPage, Checkout } from '../pages/Checkout';
import { OrderPage, OrderLookup, PaymentResult } from '../pages/Orders';
import { ErrorPage } from '../pages/ErrorPage';
const Games = lazy(() => import('../pages/Games').then((module) => ({ default: module.Games })));
const News = lazy(() => import('../pages/News').then((module) => ({ default: module.News })));
const Admin = lazy(() => import('../pages/Admin').then((module) => ({ default: module.Admin })));
const Account = lazy(() =>
  import('../pages/Account').then((module) => ({ default: module.Account })),
);
const AuthRecovery = lazy(() =>
  import('../pages/AuthRecovery').then((module) => ({ default: module.AuthRecovery })),
);
const StaffDashboard = lazy(() =>
  import('../pages/StaffDashboard').then((module) => ({ default: module.StaffDashboard })),
);
const AccountAppeal = lazy(() =>
  import('../pages/AccountAppeal').then((module) => ({ default: module.AccountAppeal })),
);
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="cau-chuyen" element={<Story />} />
        <Route path="tin-tuc" element={<News />} />
        <Route path="tro-choi" element={<Games />} />
        <Route path="san-pham" element={<Products />} />
        <Route path="san-pham/:slug" element={<ProductDetail />} />
        <Route path="ve-chung-toi" element={<About />} />
        <Route path="lien-he" element={<Contact />} />
        <Route path="tai-khoan" element={<Account />} />
        <Route path="khieu-nai-tai-khoan" element={<AccountAppeal />} />
        <Route path="loi/:status" element={<ErrorPage />} />
        <Route path="quen-mat-khau" element={<AuthRecovery />} />
        <Route path="dat-lai-mat-khau" element={<AuthRecovery reset />} />
        <Route path="gio-hang" element={<CartPage />} />
        <Route path="thanh-toan" element={<Checkout />} />
        <Route path="thanh-toan/ket-qua" element={<PaymentResult />} />
        <Route path="don-hang/:id" element={<OrderPage />} />
        <Route path="tra-cuu-don-hang" element={<OrderLookup />} />
        <Route path="*" element={<ErrorPage status={404} />} />
      </Route>
      <Route path="quan-tri" element={<StaffDashboard />} />
      <Route path="admin" element={<Admin />} />
      <Route path="*" element={<ErrorPage status={404} />} />
    </Routes>
  );
}
