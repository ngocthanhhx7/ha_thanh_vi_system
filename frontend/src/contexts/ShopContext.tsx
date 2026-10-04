import { createContext, useEffect, useState, type ReactNode } from 'react';
import { seed, type Content } from '../constants/catalog';
import type { CartItem } from '../constants/commerce';
import { api } from '../services/api';
type Shop = {
  content: Content;
  cart: CartItem[];
  add: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  refresh: () => Promise<void>;
};
export const ShopContext = createContext<Shop | null>(null);
function storedCart(): CartItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem('htv-cart') || '[]');
    if (!Array.isArray(raw)) return [];
    const unique = new Map<string, CartItem>();
    raw.forEach((value) => {
      if (
        value &&
        typeof value.productId === 'string' &&
        Number.isInteger(value.quantity) &&
        value.quantity > 0 &&
        value.quantity <= 99
      )
        unique.set(value.productId, { productId: value.productId, quantity: value.quantity });
    });
    return Array.from(unique.values()).slice(0, 20);
  } catch {
    return [];
  }
}
export function ShopProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content>(seed);
  const [cart, setCart] = useState<CartItem[]>(storedCart);
  const refresh = async () => {
    try {
      const data = await api.content();
      if (data.site && Array.isArray(data.products)) setContent(data);
    } catch {
      /* Bundled brand content remains available offline. */
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('htv-cart', JSON.stringify(cart));
    } catch {
      /* Cart remains usable for this page session. */
    }
  }, [cart]);
  const add = (id: string) => {
    if (!content.products.some((p) => p.id === id && p.price !== null)) return;
    setCart((items) =>
      items.some((item) => item.productId === id)
        ? items.map((item) =>
            item.productId === id ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item,
          )
        : items.length < 20
          ? [...items, { productId: id, quantity: 1 }]
          : items,
    );
  };
  const setQuantity = (id: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) return;
    setCart((items) =>
      quantity === 0
        ? items.filter((item) => item.productId !== id)
        : items.map((item) => (item.productId === id ? { ...item, quantity } : item)),
    );
  };
  return (
    <ShopContext.Provider
      value={{ content, cart, add, setQuantity, clearCart: () => setCart([]), refresh }}
    >
      {children}
    </ShopContext.Provider>
  );
}
