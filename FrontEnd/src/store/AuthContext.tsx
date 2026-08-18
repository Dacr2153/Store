import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, refreshAccessToken } from '../api/login';
import { singup as apiSingup, singupBusiness as apiSingupBusiness } from '../api/singup';
import { API_URL } from '../api/config';
import { useWishlistStore } from './WishlistStore';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  roles: string[];
  isAdmin: boolean;
  isBusiness: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signUpBusiness: (
    email: string,
    password: string,
    companyName: string,
    companyId: string
  ) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
  const [roles, setRoles] = useState<string[]>([]);
  const loadWishlist = useWishlistStore((s) => s.loadFromServer);

  const isAuthenticated = !!token;
  const isAdmin = roles.includes('admin');
  const isBusiness = roles.includes('business');

  // Fetch /me whenever the token changes so that role-aware UI (e.g. the Vendor
  // and Admin nav links) reflects the actual permissions of the logged-in user.
  useEffect(() => {
    if (!token) {
      setRoles([]);
      return;
    }
    let cancelled = false;
    const fetchMe = async (t: string) => {
      const r = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (r.status === 401) {
        // Try to refresh exactly once per token. If the refresh returns a
        // token that itself fails /me, do NOT loop — fall back to signing out.
        const newToken = await refreshAccessToken();
        if (cancelled) return;
        if (newToken && newToken !== t) {
          setToken(newToken);
          return;
        }
        // No refresh available, or refresh returned the same token that just
        // failed: stop and clear auth so we don't infinite-loop the effect.
        setToken(null);
        setRoles([]);
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const me = await r.json();
      if (!cancelled) setRoles(Array.isArray(me?.roles) ? me.roles : []);
    };
    fetchMe(token).catch(() => {
      if (!cancelled) setRoles([]);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'authToken') {
        setToken(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const t = await apiLogin(email, password);
    localStorage.setItem('authToken', t);
    setToken(t);
    // Sync favourites from server immediately after login.
    loadWishlist();
  }, [loadWishlist]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      await apiSingup(email, password);
      await signIn(email, password);
    },
    [signIn]
  );

  const signUpBusiness = useCallback(
    async (email: string, password: string, companyName: string, companyId: string) => {
      await apiSingupBusiness(email, password, companyName, companyId);
      await signIn(email, password);
    },
    [signIn]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    setToken(null);
    // Clear local wishlist cache on sign-out so another user's session starts fresh.
    useWishlistStore.setState({ ids: [] });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        roles,
        isAdmin,
        isBusiness,
        signIn,
        signUp,
        signUpBusiness,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
