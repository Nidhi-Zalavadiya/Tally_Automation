/* eslint-disable react-refresh/only-export-components */
// src/context/ThemeContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('einvoice_theme') || 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    // Remove both, add current — clean toggle
    html.classList.remove('dark', 'light');
    html.classList.add(theme);
    localStorage.setItem('einvoice_theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}