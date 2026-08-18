import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Github, Mail } from "lucide-react";

/**
 * Phase M — Rich footer with brand sections, links, newsletter teaser and
 * payment methods strip.
 */
export const Footer: React.FC = () => {
  return (
    <footer className="bg-brand-950 text-white/80 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-400 to-accent-500 grid place-items-center">
              <span className="text-white font-bold">F</span>
            </div>
            <span className="text-xl font-extrabold text-white">FinalStore</span>
          </div>
          <p className="text-sm">
            Curated products. Fast checkout. A modern e-commerce experience.
          </p>
          <div className="flex gap-3 mt-4">
            <a href="#" aria-label="Facebook" className="p-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Twitter" className="p-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Instagram" className="p-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" aria-label="GitHub" className="p-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">
            Shop
          </h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/store" className="hover:text-white">All products</Link></li>
            <li><Link to="/shop" className="hover:text-white">Featured</Link></li>
            <li><Link to="/virtual-try-on" className="hover:text-white">Virtual try-on</Link></li>
            <li><Link to="/cart" className="hover:text-white">Cart</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">
            Account
          </h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/login" className="hover:text-white">Login</Link></li>
            <li><Link to="/user-registration" className="hover:text-white">Sign up</Link></li>
            <li><Link to="/business-registration" className="hover:text-white">Sell on FinalStore</Link></li>
            <li><Link to="/account" className="hover:text-white">My account</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">
            Newsletter
          </h3>
          <p className="text-sm mb-3">Get the latest deals and updates.</p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex bg-white/5 rounded-md overflow-hidden ring-1 ring-white/10 focus-within:ring-accent-400"
          >
            <Mail className="w-4 h-4 text-white/40 self-center ml-3" />
            <input
              type="email"
              placeholder="you@example.com"
              aria-label="Email"
              className="flex-1 bg-transparent px-2 py-2 text-sm placeholder-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 bg-accent-500 hover:bg-accent-600 text-brand-950 font-semibold text-sm"
            >
              Join
            </button>
          </form>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/50">
          <p>© {new Date().getFullYear()} FinalStore. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
