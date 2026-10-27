import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Upload, Key, User, LogOut, LogIn, Menu, X, Shield, HelpCircle } from 'lucide-react';
import { api, getToken, getStoredUser, setStoredUser, clearToken, AUTH_CHANGED_EVENT } from '../api/client';

export const Navbar: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // The navbar stays mounted across pages: follow logins and logouts here and in other tabs.
    const sync = () => setUser(getToken() ? getStoredUser() : null);
    sync();
    if (getToken()) {
      // Refresh the stored profile, so a changed role (e.g. admin) shows without logging in again.
      api.getMe().then(me => setStoredUser(me)).catch(() => undefined);
    }
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    setUser(null);
    navigate('/');
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3">
              <img src="/logo.svg" alt="" className="w-10 h-10" />
              <div>
                <span className="font-bold text-lg text-slate-900 tracking-tight block">Question Hub <span className="text-xs font-medium text-slate-500 tracking-normal">for Moodle</span></span>
                <span className="text-xs text-slate-500 block -mt-1">Schweizer Gymnasium Fragekatalog</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1.5 transition">
              <BookOpen className="w-4 h-4" />
              <span>Katalog</span>
            </Link>
            <Link to="/upload" className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1.5 transition">
              <Upload className="w-4 h-4" />
              <span>Paket hochladen</span>
            </Link>
            <Link to="/anleitung" className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1.5 transition">
              <HelpCircle className="w-4 h-4" />
              <span>Anleitung</span>
            </Link>

            {user ? (
              <div className="flex items-center space-x-4 pl-4 border-l border-slate-200">
                {user.role === 'admin' && (
                  <Link to="/admin" className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1.5 transition">
                    <Shield className="w-4 h-4" />
                    <span>Administration</span>
                  </Link>
                )}
                <Link to="/dashboard" className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1.5 transition">
                  <User className="w-4 h-4" />
                  <span>{user.full_name || 'Dashboard'}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-slate-500 hover:text-red-600 flex items-center space-x-1 transition"
                  title="Abmelden"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Abmelden</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3 pl-4 border-l border-slate-200">
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-700 hover:text-red-600 flex items-center space-x-1 transition"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Anmelden</span>
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-medium bg-red-600 text-white px-3.5 py-1.5 rounded-md hover:bg-red-700 shadow-sm transition"
                >
                  Registrieren
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-slate-600 hover:text-slate-900 p-2"
              aria-label="Menü"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-2">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
          >
            Katalog
          </Link>
          <Link
            to="/upload"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
          >
            Paket hochladen
          </Link>
          <Link
            to="/anleitung"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
          >
            Anleitung
          </Link>
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
                >
                  Administration
                </Link>
              )}
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
              >
                Dashboard ({user.full_name})
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-2 text-base font-medium text-slate-500 hover:text-red-600"
              >
                Abmelden
              </button>
            </>
          ) : (
            <div className="pt-2 border-t border-slate-100 flex flex-col space-y-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-base font-medium text-slate-700 hover:text-red-600"
              >
                Anmelden
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-center text-base font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Registrieren
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
