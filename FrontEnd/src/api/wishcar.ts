import { API_URL } from './config';
import { refreshAccessToken } from './login';
import type { CartItem } from '../types';

export interface WishCart {
  id: string;
  total: number;
  items: CartItem[];
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// Makes a fetch call; if the server returns 401, attempts a token refresh and
// retries once. If the refresh also fails, clears the stored tokens and throws.
async function authFetch(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, { ...init, headers: getAuthHeaders() });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(url, { ...init, headers: getAuthHeaders() });
    } else {
      // Refresh failed — token is gone, clear everything
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    }
  }
  return res;
}

export async function addItemToWishCar(itemId: string, quantity: number = 1): Promise<{ message: string }> {
  const response = await authFetch(`${API_URL}/addItem/${itemId}`, {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  });
  if (!response.ok) throw new Error(`Failed to add item: ${response.statusText}`);
  return response.json();
}

export async function getWishCar(): Promise<{ id: string; total: number }> {
  const response = await authFetch(`${API_URL}/wishcar`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Failed to get cart: ${response.statusText}`);
  return response.json();
}

export async function listCartItems(): Promise<CartItem[]> {
  const response = await authFetch(`${API_URL}/wishcar`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Failed to list cart items: ${response.statusText}`);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  // Map CarItemDetail from backend → CartItem shape used by the frontend.
  // product_id is the product's own ID; we use it as the item key for
  // add / remove / update operations.
  return data.map((it: Record<string, unknown>) => ({
    id: (it.product_id as string) ?? (it.id as string),
    product_id: (it.product_id as string) ?? (it.id as string),
    name: (it.name as string) ?? '',
    description: (it.description as string) ?? '',
    price: Number(it.price) || 0,
    stock: Number(it.stock) || 0,
    url: (it.url as string) ?? '',
    server_image_url: (it.url as string) ? `${API_URL}${it.url}` : '/placeholder.svg',
    quantity: Number(it.quantity) || 1,
    images: [],
    variations: [],
    ratings: [],
    shipping: { estimatedDays: 3, cost: 5.99 },
  } as CartItem));
}

export async function removeItemFromWishCar(itemId: string): Promise<void> {
  const response = await authFetch(`${API_URL}/wishcar/${itemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to remove item: ${response.statusText}`);
}

export async function createOrder(notes?: string): Promise<unknown> {
  const response = await authFetch(`${API_URL}/orders`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? '' }),
  });
  if (!response.ok) throw new Error(`Failed to create order: ${response.statusText}`);
  return response.json();
}

export async function listOrders(): Promise<unknown[]> {
  const response = await fetch(`${API_URL}/orders`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to list orders: ${response.statusText}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
