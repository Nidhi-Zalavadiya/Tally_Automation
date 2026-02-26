// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on page reload
  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    const saved = sessionStorage.getItem('auth_user');
    if (token && saved) {
      try { setUser(JSON.parse(saved)); }
      catch { sessionStorage.clear(); }
    }
    setLoading(false);
  }, []);

  /**
   * login() — verify credentials → store token → set user state.
   * On failure, error propagates to the caller (AuthModal shows it).
   */
  const login = async (email, password) => {
    const res  = await authApi.login({ email, password });
    const data = res.data;
    const user = {
      id:                data.user_id,
      email:             data.email,
      first_name:        data.first_name,
      last_name:         data.last_name,
      phone:             data.phone || '',
      is_email_verified: data.is_email_verified,
    };
    sessionStorage.setItem('auth_token', data.token);
    sessionStorage.setItem('auth_user',  JSON.stringify(user));
    setUser(user);
    return data;
  };

  /**
   * signup() — create account + email OTP sent.
   * Does NOT log the user in yet — they must verify the code first.
   * Token stored as 'pending_token' until finishLogin() is called.
   */
  const signup = async (email, password, first_name = '', last_name = '', phone = '') => {
    const res  = await authApi.signup({ email, password, first_name, last_name, phone });
    const data = res.data;
    sessionStorage.setItem('pending_token', data.token);
    sessionStorage.setItem('pending_user',  JSON.stringify({
      id:                data.user_id,
      email:             data.email,
      first_name:        data.first_name,
      last_name:         data.last_name,
      phone:             data.phone || '',
      is_email_verified: false,
    }));
    return data;
  };

  /**
   * finishLogin() — called right after OTP is verified successfully.
   * Promotes pending_token → auth_token and sets user state so the
   * modal auto-dismisses (AuthModal only renders when !user).
   */
  const finishLogin = () => {
    const token = sessionStorage.getItem('pending_token');
    const saved = sessionStorage.getItem('pending_user');
    if (token && saved) {
      sessionStorage.setItem('auth_token', token);
      sessionStorage.setItem('auth_user',  saved);
      sessionStorage.removeItem('pending_token');
      sessionStorage.removeItem('pending_user');
      try {
        const u = JSON.parse(saved);
        setUser({ ...u, is_email_verified: true });
      } catch { /* ignore JSON parse errors */ }
    }
  };

  const logout = () => {
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, finishLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}