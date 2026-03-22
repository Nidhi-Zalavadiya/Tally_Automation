// src/context/AppStateContext.jsx
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
function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function lsDel(key) { try { localStorage.removeItem(key); } catch {} }

// ── Debounce helper ────────────────────────────────────────────
function useDebounce(fn, delay) {
  const timerRef = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function AppStateProvider({ children }) {

  const [companies, setCompanies] = useState(() => ls('app_companies', []));
  const [uploadedInvoices, setUploadedInvoices] = useState(() => ls('app_invoices', []));
  const [mappingStatus, setMappingStatus] = useState(() => ls('app_mapping_status', {}));
  
  // NEW: Track the currently selected company for invoice saving
  const [activeCompanyId, setActiveCompanyId] = useState(() => ls('app_active_company_id', null));

  const [serverSettings, setServerSettings] = useState(null);
  const [loadingFromServer, setLoadingFromServer] = useState(false);

  useEffect(() => { lsSet('app_companies', companies); }, [companies]);
  useEffect(() => { lsSet('app_invoices', uploadedInvoices); }, [uploadedInvoices]);
  useEffect(() => { lsSet('app_mapping_status', mappingStatus); }, [mappingStatus]);
  useEffect(() => { lsSet('app_active_company_id', activeCompanyId); }, [activeCompanyId]);

  // ── Load from server on login ─────────────────────────────────
  const loadFromServer = useCallback(async () => {
    setLoadingFromServer(true);
    try {
      // 1. Only load connected companies on global login.
      // (Settings and invoices are now loaded dynamically when a company is selected)
      const cRes = await companiesApi.list();
      const dbCompanies = cRes.data?.companies || [];
      mergeCompanies(dbCompanies);
    } catch (e) {
      console.warn('[AppState] Failed to load from server:', e.message);
    } finally {
      setLoadingFromServer(false);
    }
  }, []);


  // ── NEW: Fetch invoices specifically for a selected company ───
  const loadInvoicesForCompany = useCallback(async (companyId) => {
    if (!companyId) return;
    
    // 🟢 CRITICAL FIX: Instantly wipe the old invoices from memory BEFORE changing the ID.
    // This absolutely prevents the old invoices from auto-saving to the new company!
    setUploadedInvoices([]);
    setMappingStatus({});
    setActiveCompanyId(companyId);

    try {
      const iRes = await settingsApi.loadInvoices(companyId);
      if (iRes.data && iRes.data.invoices) {
        setUploadedInvoices(iRes.data.invoices);
        setMappingStatus(iRes.data.mapping_status || {});
      }
    } catch (e) {
      console.warn('[AppState] Failed to load invoices:', e.message);
    }
  }, []);

  // ── Auto-save invoices to DB when they change ─────────────────
 const _saveInvoicesToServer = useCallback(async (invoiceList, statusMap, companyId) => {
  // 🟢 Guard: If the list is empty, don't auto-save. 
  // This prevents '[]' from being pushed to the DB while switching companies.
  if (!companyId || !invoiceList || invoiceList.length === 0) return; 

  try {
    await settingsApi.saveInvoices(companyId, { invoices: invoiceList, mapping_status: statusMap });
  } catch (e) {
    console.warn('[AppState] Invoice sync failed:', e.message);
  }
}, []);

  const debouncedSaveInvoices = useDebounce(_saveInvoicesToServer, 2000);

  // Watch for invoice changes AND company changes to trigger auto-save
  useEffect(() => {
    if (uploadedInvoices.length > 0 && activeCompanyId) {
      debouncedSaveInvoices(uploadedInvoices, mappingStatus, activeCompanyId);
    }
  }, [uploadedInvoices, mappingStatus, activeCompanyId]);

  // ── Company helpers ───────────────────────────────────────────
  const mergeCompanies = useCallback((dbList) => {
    setCompanies((prev) => {
      const merged = [...dbList];
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
  // Refresh masters for a company that's already connected
  const refreshCompanyMasters = useCallback(async (companyId) => {
    try {
      // 🟢 API expects the integer ID in the URL path
      const res = await companiesApi.refresh(companyId);
      
      if (res.data) {
        // Catch closed companies during re-sync
        if (!res.data.ledgers || res.data.ledgers.length === 0) {
          return { ok: false, message: 'Company is NOT OPEN in Tally. Please open it in Tally Prime and click Re-sync again.' };
        }

        // Update the React state with the fresh data
        addOrUpdateCompany({
          id:          companyId,
          company_name:res.data.company_name,
          ledgers:     res.data.ledgers,
          stock_items: res.data.stock_items,
          units:       res.data.units,
        });
        return { ok: true, message: 'Sync successful' };
      }
    } catch (e) {
      return { ok: false, message: e.response?.data?.detail || 'Refresh failed. Make sure Tally is open.' };
    }
  }, [addOrUpdateCompany]);

  // ── Invoice helpers ───────────────────────────────────────────
  const setInvoices = useCallback((list) => {
    setUploadedInvoices(list);
  }, []);

const clearInvoices = useCallback(async () => {
    // 1. Instantly wipe memory and localStorage
    setUploadedInvoices([]);
    setMappingStatus({});
    lsDel('app_invoices');
    lsDel('app_mapping_status');

    // 2. Wipe the Database row for this specific company
    if (activeCompanyId) {
      try { 
        await settingsApi.clearInvoices(activeCompanyId); 
        console.log(`✅ Invoices cleared for company ${activeCompanyId}`);
      } catch (e) {
        console.error('Failed to clear DB invoices:', e);
      }
    }
  }, [activeCompanyId]);

  const updateMappingStatus = useCallback((invoice_no, mapped, total) => {
    setMappingStatus((prev) => ({ ...prev, [invoice_no]: { mapped, total } }));
  }, []);

  // ── Clear all on logout ───────────────────────────────────────
  const clearAll = useCallback(() => {
    setCompanies([]);
    setUploadedInvoices([]);
    setMappingStatus({});
    setServerSettings(null);
    setActiveCompanyId(null);
    lsDel('app_companies');
    lsDel('app_invoices');
    lsDel('app_mapping_status');
    lsDel('app_active_company_id');
    lsDel('ledger_config');
    lsDel('rate_wise_ledgers');
    lsDel('voucher_types');
  }, []);

  return (
    <AppStateContext.Provider value={{
      companies, mergeCompanies, addOrUpdateCompany, removeCompany, refreshCompanyMasters,
      
      uploadedInvoices, setInvoices, clearInvoices,
      mappingStatus, updateMappingStatus,
      
      loadInvoicesForCompany, // <-- Exposed for InvoiceMapping.jsx
      activeCompanyId,
      setActiveCompanyId,
      
      serverSettings, loadFromServer, loadingFromServer, clearAll,
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