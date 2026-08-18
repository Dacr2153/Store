import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart,
  User,
  Menu,
  X,
  Settings,
  LogIn,
  UserPlus,
  Brain,
  Search,
  LogOut,
  Store as StoreIcon,
  GitCompareArrows,
} from "lucide-react";
import { useCart } from "../../store/CartContext";
import { useAuth } from "../../store/AuthContext";
import { useCompareStore } from "../../store/CompareStore";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { ThemeToggle } from "../common/ThemeToggle";
import { NotificationBell } from "../common/NotificationBell";
import { VoiceSearchButton } from "../common/VoiceSearchButton";
import { searchSuggest, type SearchSuggestion } from "../../api/search";

/**
 * Phase M — Modern, sticky navbar.
 * - Top bar: brand · primary search · cart · auth icons.
 * - Bottom strip on desktop with persistent nav links.
 * - Mobile: drawer-style menu via the hamburger icon.
 */

const navLink = (active: boolean) =>
  `relative px-3 py-2 text-sm font-medium transition-colors ${
    active ? "text-white" : "text-white/70 hover:text-white"
  }`;

export const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const { state } = useCart();
  const { isAuthenticated, signOut, isAdmin, isBusiness } = useAuth();
  const compareCount = useCompareStore((s) => s.items.length);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Debounced autocomplete suggestions.
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const handle = setTimeout(() => {
      searchSuggest(searchTerm, ctrl.signal).then(setSuggestions);
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [searchTerm]);

  // Close suggestions on outside click.
  useEffect(() => {
    if (!showSuggest) return;
    const onClick = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showSuggest]);

  const handleLogout = () => {
    signOut();
    setIsMenuOpen(false);
    navigate("/login");
  };

  const submitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggest(false);
    navigate(`/shop?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    submitSearch(searchTerm);
  };

  const cartCount = state.items.length;
  const filteredSuggestions = useMemo(() => suggestions.slice(0, 8), [suggestions]);

  return (
    <header
      className={`sticky top-0 z-40 transition-shadow ${
        scrolled ? "shadow-lg" : ""
      }`}
    >
      <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-700 text-white dark:from-black dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-6 h-16">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-400 to-accent-500 grid place-items-center shadow-md">
                <StoreIcon className="w-5 h-5 text-white" />
              </div>
              <span className="hidden sm:inline text-xl font-extrabold tracking-tight">
                FinalStore
              </span>
            </Link>

            <form ref={formRef} onSubmit={handleSearch} className="flex-1 max-w-2xl relative">
              <div className="flex items-stretch bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-accent-400">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggest(true);
                  }}
                  onFocus={() => setShowSuggest(true)}
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  className="flex-1 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none"
                />
                <VoiceSearchButton
                  onTranscript={(txt) => {
                    setSearchTerm(txt);
                    setShowSuggest(true);
                  }}
                  onCommit={(txt) => submitSearch(txt)}
                />
                <button
                  type="submit"
                  aria-label={t("nav.search")}
                  className="px-4 bg-accent-500 hover:bg-accent-600 text-white transition-colors"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
              {showSuggest && filteredSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-80 overflow-y-auto">
                  {filteredSuggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggest(false);
                          navigate(`/products/${s.id}`);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800"
                      >
                        {s.image ? (
                          <img src={s.image} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          {s.price !== undefined && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">${s.price.toFixed(2)}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                  {searchTerm.trim() && (
                    <li className="border-t border-gray-100 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => submitSearch(searchTerm)}
                        className="w-full px-3 py-2 text-sm text-brand-500 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 text-left"
                      >
                        {t("nav.search")}: "{searchTerm}"
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </form>

            <div className="hidden md:flex items-center gap-1">
              <Link
                to="/virtual-try-on"
                className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10 transition-colors"
                title={t("nav.tryon")}
                aria-label={t("nav.tryon")}
              >
                <Brain className="w-5 h-5" />
              </Link>
              <Link
                to="/compare"
                className="relative p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10 transition-colors"
                aria-label={t("nav.compare")}
                title={t("nav.compare")}
              >
                <GitCompareArrows className="w-5 h-5" />
                {compareCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-accent-500 text-brand-950 text-xs font-bold rounded-full h-5 min-w-[1.25rem] px-1 grid place-items-center">
                    {compareCount}
                  </span>
                )}
              </Link>
              <Link
                to="/cart"
                className="relative p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10 transition-colors"
                aria-label={`${t("nav.cart")} (${cartCount})`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-accent-500 text-brand-950 text-xs font-bold rounded-full h-5 min-w-[1.25rem] px-1 grid place-items-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              {isAuthenticated && <NotificationBell />}
              <ThemeToggle />

              {!isAuthenticated ? (
                <div className="flex items-center gap-2 ml-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-white dark:bg-gray-800/10 transition-colors"
                  >
                    <LogIn className="w-4 h-4" /> {t("nav.login")}
                  </Link>
                  <Link
                    to="/user-registration"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md bg-accent-500 hover:bg-accent-600 text-brand-950 transition-colors shadow-sm"
                  >
                    <UserPlus className="w-4 h-4" /> {t("nav.signup")}
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-1 ml-2">
                  <Link
                    to="/account"
                    className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10"
                    aria-label={t("nav.account")}
                    title={t("nav.account")}
                  >
                    <User className="w-5 h-5" />
                  </Link>
                  {isBusiness && (
                    <Link
                      to="/vendor"
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-gray-800/10 hover:bg-white dark:bg-gray-800/20 text-white"
                    >
                      {t("nav.vendor")}
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10"
                      aria-label={t("nav.admin")}
                    >
                      <Settings className="w-5 h-5" />
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white dark:bg-gray-800/10"
                    aria-label={t("nav.signout")}
                    title={t("nav.signout")}
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              )}

              <LanguageSwitcher className="ml-2 text-white" />
            </div>

            <button
              className="md:hidden p-2 rounded-md text-white hover:bg-white dark:bg-gray-800/10"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        <nav className="hidden md:block border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 h-11">
            <NavLink to="/" end className={({ isActive }) => navLink(isActive)}>
              {t("nav.home")}
            </NavLink>
            <NavLink to="/store" className={({ isActive }) => navLink(isActive)}>
              {t("nav.allProducts")}
            </NavLink>
            <NavLink to="/shop" className={({ isActive }) => navLink(isActive)}>
              {t("nav.shop")}
            </NavLink>
            <NavLink to="/virtual-try-on" className={({ isActive }) => navLink(isActive)}>
              {t("nav.tryon")}
            </NavLink>
            <NavLink to="/compare" className={({ isActive }) => navLink(isActive)}>
              {t("nav.compare")}
            </NavLink>
            {isBusiness && (
              <NavLink to="/vendor" className={({ isActive }) => navLink(isActive)}>
                {t("nav.vendor")}
              </NavLink>
            )}
            {isAdmin && (
              <>
                <NavLink to="/admin" className={({ isActive }) => navLink(isActive)}>
                  {t("nav.admin")}
                </NavLink>
                <NavLink to="/admin/orders" className={({ isActive }) => navLink(isActive)}>
                  {t("nav.adminOrders")}
                </NavLink>
              </>
            )}
          </div>
        </nav>

        {isMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-brand-950/95 backdrop-blur">
            <div className="px-4 py-3 flex flex-col gap-1">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.home")}
              </Link>
              <Link to="/store" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.allProducts")}
              </Link>
              <Link to="/shop" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.shop")}
              </Link>
              <Link to="/cart" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.cart")} ({cartCount})
              </Link>
              <Link to="/compare" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.compare")} ({compareCount})
              </Link>
              <Link to="/virtual-try-on" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                {t("nav.tryon")}
              </Link>
              {!isAuthenticated ? (
                <>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                    {t("nav.login")}
                  </Link>
                  <Link to="/user-registration" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md bg-accent-500 text-brand-950 font-semibold">
                    {t("nav.signup")}
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/account" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                    {t("nav.account")}
                  </Link>
                  {isBusiness && (
                    <Link to="/vendor" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                      {t("nav.vendor")}
                    </Link>
                  )}
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                      {t("nav.admin")}
                    </Link>
                  )}
                  <button onClick={handleLogout} className="text-left px-3 py-2 rounded-md hover:bg-white dark:bg-gray-800/10">
                    {t("nav.signout")}
                  </button>
                </>
              )}
              <div className="px-3 pt-2 flex items-center gap-3">
                <ThemeToggle />
                <LanguageSwitcher className="text-white" />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
