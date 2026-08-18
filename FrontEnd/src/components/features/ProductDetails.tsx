import React from 'react';
import { X, ShoppingCart, Star } from 'lucide-react';
import type { Product } from '../../types';
import { Button } from '../common/Button';
import { useCart } from '../../store/CartContext';
import { toAbsoluteUrl } from '../../api/config';
import { addItemToWishCar } from '../../api/wishcar';
import toast from 'react-hot-toast';

interface ProductDetailsProps {
  product: Product;
  onClose: () => void;
}

export const ProductDetails: React.FC<ProductDetailsProps> = ({ product, onClose }) => {
  const { dispatch } = useCart();

  const addToCart = async () => {
    const enriched: Product = {
      ...product,
      server_image_url: product.url ? toAbsoluteUrl(product.url) : "/placeholder.svg",
    };
    dispatch({ type: 'ADD_ITEM', payload: enriched });
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        await addItemToWishCar(String(product.id));
        toast.success(`"${product.name}" added to cart`);
      } catch {
        toast.error('Could not sync cart. Please try again.');
      }
    } else {
      toast.success(`"${product.name}" added to cart`);
    }
  };

  const imageUrl = product.url ? toAbsoluteUrl(product.url) : "/placeholder.svg";
  product.server_image_url = imageUrl;
  

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 z-10"
          >
            <X className="w-6 h-6" />
          </button>
          
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-64 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
          />
        </div>

        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{product.name}</h2>
              <div className="flex items-center gap-1 text-yellow-400 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-current" />
                ))}
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              ${product.price.toFixed(2)}
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400 mb-6">{product.description}</p>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {product.stock > 0 ? (
                <span className="text-green-600">{product.stock} in stock</span>
              ) : (
                <span className="text-red-600">Out of stock</span>
              )}
            </div>
            <Button
              onClick={addToCart}
              icon={<ShoppingCart className="w-5 h-5" />}
              disabled={product.stock === 0}
            >
              Add to Cart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};