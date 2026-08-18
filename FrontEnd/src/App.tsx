import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { CartProvider } from './store/CartContext';
import { AuthProvider } from './store/AuthContext';
import { ThemeProvider } from './store/ThemeContext';
import { NotificationsProvider } from './store/NotificationsContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { PrivateRoute } from './components/common/PrivateRoute';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProductsPage } from './pages/ProductsPage';
import { StorePage } from './pages/StorePage';
import { ShopPage } from './pages/ShopPage';
import { CartPage } from './pages/CartPage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { AdminOrdersPage } from './pages/AdminOrdersPage';
import { VendorDashboardPage } from './pages/VendorDashboardPage';
import { VirtualTryOn } from './pages/VirtualTryOn';
import { UserRegistrationPage } from './pages/UserRegistrationPage';
import { BusinessRegistrationPage } from './pages/BusinessRegistrationPage';
import { ComparePage } from './pages/ComparePage';
import { SearchBenchmarkPage } from './pages/SearchBenchmarkPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { useWishlistStore } from './store/WishlistStore';

function AppInner() {
  const loadWishlist = useWishlistStore((s) => s.loadFromServer);

  // Sync wishlist with backend whenever the app mounts (covers page reload and login).
  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col transition-colors">
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/user-registration" element={<UserRegistrationPage />} />
          <Route path="/business-registration" element={<BusinessRegistrationPage />} />
          <Route path="/products/:productId" element={<ProductsPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/search-benchmark" element={<SearchBenchmarkPage />} />
          <Route path="/account" element={<PrivateRoute><AccountPage /></PrivateRoute>} />
          <Route path="/account/returns" element={<PrivateRoute><ReturnsPage /></PrivateRoute>} />
          <Route path="/account/loyalty" element={<PrivateRoute><LoyaltyPage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute adminOnly><AdminPage /></PrivateRoute>} />
          <Route path="/admin/orders" element={<PrivateRoute adminOnly><AdminOrdersPage /></PrivateRoute>} />
          <Route path="/vendor" element={<PrivateRoute><VendorDashboardPage /></PrivateRoute>} />
          <Route path="/virtual-try-on" element={<VirtualTryOn />} />
        </Routes>
      </main>

      <footer>
        <Footer />
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <NotificationsProvider>
            <CartProvider>
              <AppInner />
            </CartProvider>
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
