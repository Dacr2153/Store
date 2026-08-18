import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { CartItem, Product } from '../types';

interface CartState {
  items: CartItem[];
  total: number;
  isAuthenticated: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: Product}
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_AUTHENTICATION'; payload: boolean }
  | { type: 'SET_CART_ITEMS'; payload: CartItem[] };

const CartContext = createContext<{
  state: CartState;
  dispatch: React.Dispatch<CartAction>;
} | null>(null);

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItem = state.items.find(item => item.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
          total: state.total + action.payload.price,
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: 1 }],
        total: state.total + action.payload.price,
      };
    }
    case 'REMOVE_ITEM': {
      const item = state.items.find(item => item.id === action.payload);
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload),
        total: state.total - (item ? item.price * item.quantity : 0),
      };
    }
    case 'UPDATE_QUANTITY': {
      const item = state.items.find(item => item.id === action.payload.id);
      if (!item) return state;
      const quantityDiff = action.payload.quantity - item.quantity;
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id
            ? { ...item, quantity: action.payload.quantity }
            : item
        ),
        total: state.total + item.price * quantityDiff,
      };
    }
    case 'CLEAR_CART':
      return { ...state, items: [], total: 0 };
    case 'SET_AUTHENTICATION':
      return { ...state, isAuthenticated: action.payload };
    case 'SET_CART_ITEMS':
      return {
        ...state,
        items: action.payload,
        total: action.payload.reduce((sum, item) => sum + item.price * item.quantity, 0)
      };
    default:
      return state;
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [], 
    total: 0, 
    isAuthenticated: !!localStorage.getItem('authToken')
  });

  // Hook personalizado para verificar autenticación
  const useAuthCheck = () => {
    const location = useLocation();

    useEffect(() => {
      const checkAuthStatus = () => {
        const authToken = localStorage.getItem('authToken');
        const isCurrentlyAuthenticated = !!authToken;

        // Verificar si el estado actual de autenticación es diferente
        if (isCurrentlyAuthenticated !== state.isAuthenticated) {
          dispatch({ 
            type: 'SET_AUTHENTICATION', 
            payload: isCurrentlyAuthenticated 
          });
        }
      };

      // Verificar al cambiar de ruta
      checkAuthStatus();
    }, [location.pathname]);
  };

  // Listener para cambios en localStorage
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'authToken') {
        dispatch({ 
          type: 'SET_AUTHENTICATION', 
          payload: !!event.newValue 
        });
      }
    };

    // Listener para eventos de almacenamiento
    window.addEventListener('storage', handleStorageChange);

    // Función para manejar cambios en el token durante la carga
    const checkAuthStatus = () => {
      const authToken = localStorage.getItem('authToken');
      dispatch({ 
        type: 'SET_AUTHENTICATION', 
        payload: !!authToken 
      });
    };

    // Verificar estado inicial
    checkAuthStatus();

    // Eventos personalizados para autenticación
    window.addEventListener('login', checkAuthStatus);
    window.addEventListener('logout', checkAuthStatus);

    // Limpiar listeners
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('login', checkAuthStatus);
      window.removeEventListener('logout', checkAuthStatus);
    };
  }, []);

  // Componente wrapper para usar el hook de verificación de autenticación
  const ChildrenWithAuthCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useAuthCheck();
    return <>{children}</>;
  };

  return (
    <CartContext.Provider value={{ state, dispatch }}>
      <ChildrenWithAuthCheck>
        {children}
      </ChildrenWithAuthCheck>
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};