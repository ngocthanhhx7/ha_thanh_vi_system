import { useContext } from 'react';
import { ShopContext } from '../contexts/ShopContext';
export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error('ShopProvider required');
  return value;
}
