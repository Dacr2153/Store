import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Eye, EyeOff, ShoppingBag } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { Seo } from "../components/common/Seo";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn(formData.email, formData.password);
      const next = sessionStorage.getItem("returnUrl") || "/";
      sessionStorage.removeItem("returnUrl");
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Seo title="Sign in" />
      <div className="min-h-[calc(100vh-200px)] grid lg:grid-cols-2">
        {/* Left: brand panel */}
        <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 text-white p-12 items-center">
          <div
            className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-accent-500/30 blur-3xl"
            aria-hidden
          />
          <div
            className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-brand-400/30 blur-3xl"
            aria-hidden
          />
          <div className="relative z-10 max-w-md">
            <Link to="/" className="inline-flex items-center gap-2 mb-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-accent-500 flex items-center justify-center shadow-lg">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold">ShopDrop</span>
            </Link>
            <h2 className="text-4xl font-extrabold leading-tight">
              Welcome back.
            </h2>
            <p className="mt-3 text-white/80 text-lg">
              Sign in to continue your shopping journey, track your orders, and
              get personalized recommendations.
            </p>
            <ul className="mt-8 space-y-3 text-white/90">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />{" "}
                Saved cart and wishlist
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />{" "}
                Faster checkout
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />{" "}
                Exclusive offers
              </li>
            </ul>
          </div>
        </div>

        {/* Right: form */}
        <div className="flex items-center justify-center p-6 sm:p-12 bg-surface-muted">
          <div className="w-full max-w-md">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-8 border border-gray-100 dark:border-gray-700">
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">Sign in</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enter your credentials to access your account.
              </p>

              {error && (
                <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      id="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 dark:text-gray-300"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white font-semibold shadow-lg shadow-brand-500/20 transition"
                >
                  <LogIn className="w-4 h-4" />
                  {isLoading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Don&apos;t have an account?{" "}
                <Link
                  to="/user-registration"
                  className="font-semibold text-brand-500 hover:text-brand-700"
                >
                  Create one
                </Link>
              </div>
              <div className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
                Want to sell?{" "}
                <Link
                  to="/business-registration"
                  className="font-semibold text-accent-600 hover:text-accent-500"
                >
                  Become a vendor
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
