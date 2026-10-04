import { BrowserRouter } from 'react-router-dom';
import { ShopProvider } from '../contexts/ShopContext';
import { AppRoutes } from '../routes/AppRoutes';
export function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <AppRoutes />
      </ShopProvider>
    </BrowserRouter>
  );
}
