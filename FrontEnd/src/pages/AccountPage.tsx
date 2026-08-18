import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../components/common/Button';
import { User, Package, LogOut, Save, Heart, Trash2, GitCompareArrows, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserInfo, updateUserProfile } from '../api/login';
import { listOrders } from '../api/wishcar';
import { useWishlistStore } from '../store/WishlistStore';
import { useCompareStore, MAX_COMPARE } from '../store/CompareStore';
import { useCart } from '../store/CartContext';
import { API_URL, toAbsoluteUrl } from '../api/config';
import type { Order } from '../types';

interface WishlistEntry {
  product_id: string;
  name: string;
  price: number;
  stock: number;
  added_at: string;
}

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistEntries, setWishlistEntries] = useState<WishlistEntry[]>([]);
  const wishlistStore = useWishlistStore();
  const compareStore = useCompareStore();
  const { dispatch } = useCart();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    const fetchUserInfo = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const data = await getUserInfo(token);
        setFormData({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
        });
      } catch (err) {
        console.error('Error al obtener la información del usuario:', err);
        navigate('/login');
      }
    };

    fetchUserInfo();
  }, [navigate]);

  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      try {
        const data = await listOrders();
        setOrders(data as Order[]);
      } catch (err) {
        console.error('Error fetching orders:', err);
      }
    };
    fetchOrders();
  }, []);

  useEffect(() => {
    const fetchWishlist = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/wishlist`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: WishlistEntry[] = await res.json();
        setWishlistEntries(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    };
    fetchWishlist();
  }, []);

  const handleRemoveFromWishlist = async (entry: WishlistEntry) => {
    await wishlistStore.toggle(entry.product_id);
    setWishlistEntries((prev) => prev.filter((e) => e.product_id !== entry.product_id));
    toast(`"${entry.name}" removed from wishlist`, { icon: '💔' });
  };

  const handleAddToCartFromWishlist = (entry: WishlistEntry) => {
    dispatch({
      type: 'ADD_ITEM',
      payload: { id: entry.product_id, name: entry.name, price: entry.price, server_image_url: '' } as never,
    });
    toast.success(`"${entry.name}" added to cart`);
  };

  const handleCompareFromWishlist = (entry: WishlistEntry) => {
    if (compareStore.has(entry.product_id)) {
      compareStore.remove(entry.product_id);
    } else if (compareStore.items.length >= MAX_COMPARE) {
      toast.error(`You can compare up to ${MAX_COMPARE} products at once`);
    } else {
      compareStore.add({ id: entry.product_id, name: entry.name, price: entry.price, stock: entry.stock });
      toast.success(`"${entry.name}" added to comparison`);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      await updateUserProfile(token, { name: formData.name, phone: formData.phone });
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.dispatchEvent(new Event('storage'));
    navigate('/login');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Account</h1>
        <Button
          variant="outline"
          icon={<LogOut className="w-5 h-5" />}
          onClick={handleLogout}
        >
          Logout
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-blue-100 p-3 rounded-full">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Profile Information</h2>
            <p className="text-gray-600 dark:text-gray-400">{formData.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          isLoading={isSaving}
          icon={<Save className="w-5 h-5" />}
        >
          Save Changes
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-blue-100 p-3 rounded-full">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Order History</h2>
        </div>

        <div className="space-y-4">
          {orders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No orders yet.</p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Order #{order.id.slice(0, 8)}</span>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      order.status === 'delivered'
                        ? 'bg-green-100 text-green-800'
                        : order.status === 'cancelled'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(order.created_at).toLocaleDateString()}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">Total: ${order.total.toFixed(2)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Wishlist */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-pink-100 dark:bg-pink-900/30 p-3 rounded-full">
            <Heart className="w-6 h-6 text-pink-600 fill-pink-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            My Wishlist
            {wishlistEntries.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({wishlistEntries.length} item{wishlistEntries.length !== 1 ? 's' : ''})</span>
            )}
          </h2>
        </div>

        {wishlistEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No saved items yet. Click the heart on any product to save it here.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wishlistEntries.map((entry) => (
              <div
                key={entry.product_id}
                className="flex flex-col gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-pink-300 dark:hover:border-pink-700 transition cursor-pointer"
                onClick={() => navigate(`/products/${entry.product_id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-white line-clamp-2 text-sm leading-snug">
                    {entry.name}
                  </span>
                  <button
                    className="flex-shrink-0 text-gray-400 hover:text-red-500 transition"
                    aria-label="Remove from wishlist"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFromWishlist(entry); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-lg font-bold text-brand-700 dark:text-brand-300">${entry.price.toFixed(2)}</p>

                {entry.stock <= 0 ? (
                  <span className="text-xs text-red-500">Out of stock</span>
                ) : entry.stock < 5 ? (
                  <span className="text-xs text-orange-500">Only {entry.stock} left</span>
                ) : (
                  <span className="text-xs text-green-600 dark:text-green-400">In stock</span>
                )}

                <p className="text-xs text-gray-400">
                  Saved {new Date(entry.added_at).toLocaleDateString()}
                </p>

                <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleAddToCartFromWishlist(entry)}
                    disabled={entry.stock <= 0}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium transition"
                  >
                    <ShoppingCart className="w-3 h-3" /> Add to cart
                  </button>
                  <button
                    onClick={() => handleCompareFromWishlist(entry)}
                    title={compareStore.has(entry.product_id) ? 'Remove from comparison' : 'Add to comparison'}
                    className={`px-2 py-1.5 rounded-md border text-xs transition ${compareStore.has(entry.product_id) ? 'bg-brand-100 border-brand-400 text-brand-700' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800'}`}
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
