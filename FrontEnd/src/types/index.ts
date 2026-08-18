export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  url?: string;
  server_image_url?: string;
  category?: string;
  discountPrice?: number;
  images: ProductImage[];
  variations: ProductVariation[];
  shipping: ShippingInfo;
  warranty?: string;
  ratings: Rating[];
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface ProductVariation {
  type: 'size' | 'color';
  value: string;
  stock: number;
  price?: number;
}

export interface ShippingInfo {
  estimatedDays: number;
  cost: number;
  freeShippingThreshold?: number;
}

export interface Rating {
  userId: string;
  rating: number;
  comment?: string;
  date: Date;
}

export interface CartItem extends Product {
  quantity: number;
  /** product_id from the server cart (used for remove / update operations) */
  product_id?: string;
}

export interface UserRegistration {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface BusinessRegistration {
  companyName: string;
  email: string;
  phone: string;
  address: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  };
  description: string;
  categories: string[];
  shippingPolicy: string;
  returnPolicy: string;
  legalDocuments: {
    nif: string;
    cif: string;
  };
}

export interface Order {
  id: string;
  user_id: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  notes?: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}
