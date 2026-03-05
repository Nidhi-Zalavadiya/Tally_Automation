// src/context/AppStateContext.jsx
//
// UPGRADED: All state now persists to the DB (not just sessionStorage).
// On login → loadFromServer() is called → restores invoices, settings, mappings.
// On logout → clearAll() clears both localStorage and in-memory state.
//
// localStorage is used only for non-sensitive runtime caching (companies + masters).
// Auth token is now in localStorage so it survives tab close.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { settings as settingsApi, companies as companiesApi } from '../services/api';

const AppStateContext = createContext(null);

// ── localStorage helpers ──────────────────────────────────────
function ls(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ── Debounce helper ────────────────────────────────────────────
function useDebounce(fn, delay) {
  const timerRef = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function AppStateProvider({ children }) {

  // companies: shape { id, company_name, connected_at, ledgers[], stock_items[], units[] }
  const [companies, setCompanies] = useState(() => ls('app_companies', []));

  // invoices from uploaded JWT file
  const [uploadedInvoices, setUploadedInvoices] = useState(() => ls('app_invoices', []));

  // mapping status per invoice_no  { [invoice_no]: { mapped, total } }
  const [mappingStatus, setMappingStatus] = useState(() => ls('app_mapping_status', {}));

  // server-loaded settings (null = not yet loaded)
  const [serverSettings, setServerSettings] = useState(null);
  const [loadingFromServer, setLoadingFromServer] = useState(false);

  // Persist companies to localStorage when they change
  useEffect(() => { lsSet('app_companies',      companies);       }, [companies]);
  useEffect(() => { lsSet('app_invoices',        uploadedInvoices); }, [uploadedInvoices]);
  useEffect(() => { lsSet('app_mapping_status',  mappingStatus);   }, [mappingStatus]);

  // ── Load from server on login ─────────────────────────────────
  const loadFromServer = useCallback(async () => {
    setLoadingFromServer(true);
    try {
      // 1. Load ledger config / rate-wise / voucher types
      const sRes = await settingsApi.load();
      const s    = sRes.data;

      // Write to localStorage so Settings.jsx and ItemMappingGrid can read them
      if (s.ledger_config && Object.keys(s.ledger_config).length > 0) {
        lsSet('ledger_config', s.ledger_config);
      }
      if (s.rate_wise_ledgers && Object.keys(s.rate_wise_ledgers).length > 0) {
        lsSet('rate_wise_ledgers', s.rate_wise_ledgers);
      }
      if (s.voucher_types && Object.keys(s.voucher_types).length > 0) {
        lsSet('voucher_types', s.voucher_types);
      }

      setServerSettings(s);

      // 2. Load saved invoices
      const iRes = await settingsApi.loadInvoices();
      if (iRes.data.invoices && iRes.data.invoices.length > 0) {
        setUploadedInvoices(iRes.data.invoices);
        setMappingStatus(iRes.data.mapping_status || {});
      }

      // 3. Load connected companies (IDs only — masters come from localStorage or reconnect)
      const cRes = await companiesApi.list();
      const dbCompanies = cRes.data?.companies || [];
      mergeCompanies(dbCompanies);

    } catch (e) {
      // Non-fatal: user just won't have pre-loaded data
      console.warn('[AppState] Failed to load from server:', e.message);
    } finally {
      setLoadingFromServer(false);
    }
  }, []);

  // ── Auto-save invoices to DB when they change ─────────────────
  const _saveInvoicesToServer = useCallback(async (invoiceList, statusMap) => {
    try {
      await settingsApi.saveInvoices({ invoices: invoiceList, mapping_status: statusMap });
    } catch (e) {
      console.warn('[AppState] Invoice sync failed:', e.message);
    }
  }, []);

  const debouncedSaveInvoices = useDebounce(_saveInvoicesToServer, 2000);

  // Watch for invoice/status changes and auto-save
  useEffect(() => {
    if (uploadedInvoices.length > 0) {
      debouncedSaveInvoices(uploadedInvoices, mappingStatus);
    }
  }, [uploadedInvoices, mappingStatus]);

  // ── Company helpers ───────────────────────────────────────────
  const mergeCompanies = useCallback((dbList) => {
    setCompanies((prev) => {
      const merged = [...dbList];
      // Merge in local masters (ledgers/items) from localStorage
      prev.forEach((p) => {
        if (p.ledgers?.length || p.stock_items?.length) {
          const idx = merged.findIndex((m) => m.id === p.id);
          if (idx !== -1) merged[idx] = { ...merged[idx], ...p };
        }
      });
      return merged;
    });
  }, []);

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

  const removeCompany = useCallback((id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Refresh masters for a company that's already connected
  const refreshCompanyMasters = useCallback(async (companyId) => {
    try {
      const res = await companiesApi.refresh(companyId);
      if (res.data) {
        addOrUpdateCompany({
          id:          companyId,
          company_name:res.data.company_name,
          ledgers:     res.data.ledgers,
          stock_items: res.data.stock_items,
          units:       res.data.units,
        });
        return { ok: true, message: res.data.message };
      }
    } catch (e) {
      return { ok: false, message: e.response?.data?.detail || 'Refresh failed' };
    }
  }, [addOrUpdateCompany]);

  // ── Invoice helpers ───────────────────────────────────────────
  const setInvoices = useCallback((list) => {
    setUploadedInvoices(list);
  }, []);

  const clearInvoices = useCallback(async () => {
    setUploadedInvoices([]);
    setMappingStatus({});
    lsDel('app_invoices');
    lsDel('app_mapping_status');
    try { await settingsApi.clearInvoices(); } catch {}
  }, []);

  const updateMappingStatus = useCallback((invoice_no, mapped, total) => {
    setMappingStatus((prev) => ({ ...prev, [invoice_no]: { mapped, total } }));
  }, []);

  // ── Clear all on logout ───────────────────────────────────────
  const clearAll = useCallback(() => {
    setCompanies([]);
    setUploadedInvoices([]);
    setMappingStatus([]);
    setServerSettings(null);
    // Clear localStorage (but NOT auth_token — that's handled by AuthContext)
    lsDel('app_companies');
    lsDel('app_invoices');
    lsDel('app_mapping_status');
    lsDel('ledger_config');
    lsDel('rate_wise_ledgers');
    lsDel('voucher_types');
  }, []);

  return (
    <AppStateContext.Provider value={{
      // Companies
      companies,
      mergeCompanies,
      addOrUpdateCompany,
      removeCompany,
      refreshCompanyMasters,
      // Invoices
      uploadedInvoices,
      setInvoices,
      clearInvoices,
      // Mapping status
      mappingStatus,
      updateMappingStatus,
      // Server settings
      serverSettings,
      loadFromServer,
      loadingFromServer,
      // Global clear
      clearAll,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}