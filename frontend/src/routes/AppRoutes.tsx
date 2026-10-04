import { Route, Routes } from 'react-router-dom';
import { Layout } from '../layouts/Layout';
import { Home } from '../pages/Home';
import { Products, ProductDetail } from '../pages/Products';
import { Story, About, NotFound } from '../pages/Editorial';
import { Contact } from '../pages/Contact';
import { Admin } from '../pages/Admin';
import { CartPage, Checkout } from '../pages/Checkout';
import { OrderPage, OrderLookup, PaymentResult } from '../pages/Orders';
import { Account } from '../pages/Account';
import { StaffDashboard } from '../pages/StaffDashboard';
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="cau-chuyen" element={<Story />} />
        <Route path="san-pham" element={<Products />} />
        <Route path="san-pham/:slug" element={<ProductDetail />} />
        <Route path="ve-chung-toi" element={<About />} />
        <Route path="lien-he" element={<Contact />} />
        <Route path="tai-khoan" element={<Account />} />
        <Route path="quan-tri" element={<StaffDashboard />} />
        <Route path="gio-hang" element={<CartPage />} />
        <Route path="thanh-toan" element={<Checkout />} />
        <Route path="thanh-toan/ket-qua" element={<PaymentResult />} />
        <Route path="don-hang/:id" element={<OrderPage />} />
        <Route path="tra-cuu-don-hang" element={<OrderLookup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<Admin />} />
    </Routes>
  );
}
