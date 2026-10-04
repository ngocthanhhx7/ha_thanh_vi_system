export const priceLabel = (price: number | null) =>
  price === null
    ? 'Liên hệ báo giá'
    : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
