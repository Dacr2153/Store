import axios from 'axios';
import { API_URL } from './config';

export interface Product {
  id: string | number;
  name: string;
  price: number;
  description?: string;
  stock?: number;
  url?: string;
  image?: string;
  server_image_url?: string;
  category?: string;
  images?: Array<{ src: string; alt: string }>;
  variations?: any[];
  shipping?: {
    estimatedDays: number;
    cost: number;
  };
  ratings?: any[];
  [key: string]: any;
}

export interface ProductData extends Omit<Product, 'id'> {
  stock?: number | string;
}

export const createProduct = async (productData: ProductData, token: string): Promise<Product> => {
  const formattedData = { ...productData, stock: Number(productData.stock) || 0 };
  const response = await axios.post<Product>(`${API_URL}/products`, formattedData, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return response.data;
};

export const getProductById = async (productId: string | number): Promise<Product> => {
  const response = await axios.get<Product>(`${API_URL}/products/${productId}`);
  return response.data;
};

export const updateProduct = async (
  productId: string | number,
  productData: ProductData,
  token: string
): Promise<Product> => {
  const response = await axios.put<Product>(`${API_URL}/products/${productId}`, productData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const deleteProduct = async (productId: string | number, token: string): Promise<any> => {
  const response = await axios.delete(`${API_URL}/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const uploadProductImage = async (
  productId: string | number,
  imageFile: File,
  token: string
): Promise<any> => {
  const formData = new FormData();
  formData.append('image', imageFile);
  const response = await axios.post(`${API_URL}/image/${productId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const listProducts = async (
  page: number = 0,
  search?: string,
  category?: string,
  minPrice?: number,
  maxPrice?: number
): Promise<Product[]> => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (minPrice !== undefined) params.set('minPrice', String(minPrice));
  if (maxPrice !== undefined) params.set('maxPrice', String(maxPrice));

  const response = await axios.get<Product[]>(`${API_URL}/products?${params.toString()}`);
  return Array.isArray(response.data) ? response.data : [];
};

// ---- Variant helpers ----

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  attributes: Record<string, string>;
  price?: number;
  stock: number;
  weight_grams?: number;
}

export interface VariantInput {
  sku: string;
  attributes: Record<string, string>;
  price?: number;
  stock: number;
  weight_grams?: number;
}

export const listProductVariants = async (productId: string | number): Promise<Variant[]> => {
  const response = await axios.get<Variant[]>(`${API_URL}/products/${productId}/variants`);
  return Array.isArray(response.data) ? response.data : [];
};

export const createProductVariant = async (
  productId: string | number,
  variant: VariantInput,
  token: string
): Promise<{ id: string }> => {
  const response = await axios.post<{ id: string }>(
    `${API_URL}/products/${productId}/variants`,
    variant,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const deleteProductVariant = async (
  productId: string | number,
  variantId: string,
  token: string
): Promise<void> => {
  await axios.delete(`${API_URL}/products/${productId}/variants/${variantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};
