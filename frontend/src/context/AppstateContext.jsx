// src/context/AppStateContext.jsx
// Persists companies + uploaded invoices in sessionStorage
// so switching tabs never loses data.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppStateContext = createContext(null);

function ss(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export function AppStateProvider({ children }) {
  // companies: from DB (on login) + session masters (ledgers/stock_items/units)
  // shape: { id, company_name, connected_at, ledgers[], stock_items[], units[] }
  const [companies, setCompanies] = useState(() => ss('app_companies', []));

  // parsed invoices from uploaded JSON file
  const [uploadedInvoices, setUploadedInvoices] = useState(() => ss('app_invoices', []));

  // mapping status per invoice_no  { [invoice_no]: { mapped, total } }
  const [mappingStatus, setMappingStatus] = useState(() => ss('app_mapping_status', {}));

  // Persist to sessionStorage on every change
  useEffect(() => { sessionStorage.setItem('app_companies',       JSON.stringify(companies));       }, [companies]);
  useEffect(() => { sessionStorage.setItem('app_invoices',        JSON.stringify(uploadedInvoices)); }, [uploadedInvoices]);
  useEffect(() => { sessionStorage.setItem('app_mapping_status',  JSON.stringify(mappingStatus));   }, [mappingStatus]);

  // ── Company helpers ───────────────────────────────────────────
  // Merge DB companies (no masters) with session masters
// Inside AppStateProvider
const mergeCompanies = useCallback((dbList) => {
  setCompanies((prev) => {
    const merged = [...dbList];
    prev.forEach((p) => {
      if (p.ledgers?.length) {
        const idx = merged.findIndex((m) => m.id === p.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...p };
      }
    });
    return merged;
  });
}, []); // Empty array means this function reference never changes

const addOrUpdateCompany = useCallback((payload) => {
  setCompanies((prev) => {
    const idx = prev.findIndex((c) => c.id === payload.id);
    if (idx !== -1) {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], ...payload };
      return arr;
    }
    return [...prev, payload];
  });
}, []);
  const removeCompany = (id) =>
    setCompanies((prev) => prev.filter((c) => c.id !== id));

  // ── Invoice helpers ───────────────────────────────────────────
  const setInvoices = (list) => setUploadedInvoices(list);
  const clearInvoices = () => {
    setUploadedInvoices([]);
    setMappingStatus({});
  };

  const updateMappingStatus = (invoice_no, mapped, total) =>
    setMappingStatus((prev) => ({ ...prev, [invoice_no]: { mapped, total } }));

  // ── Clear all on logout ───────────────────────────────────────
  const clearAll = () => {
    setCompanies([]);
    setUploadedInvoices([]);
    setMappingStatus({});
  };

  return (
    <AppStateContext.Provider value={{
      companies, mergeCompanies, addOrUpdateCompany, removeCompany,
      uploadedInvoices, setInvoices, clearInvoices,
      mappingStatus, updateMappingStatus,
      clearAll,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}