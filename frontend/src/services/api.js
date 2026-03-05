// src/services/api.js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

const api = axios.create({ baseURL: BASE });

// ── REQUEST INTERCEPTOR ───────────────────────────────────────
// Injects the Bearer token into every outgoing request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('auth_token'); // Ensure this key matches your Login logic
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// ── RESPONSE INTERCEPTOR ──────────────────────────────────────
// Handles global errors like 401 (Unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    
    // If server returns 401, the token is invalid or missing
    if (status === 401) {
      console.warn("Unauthorized request - Redirecting to login.");
      localStorage.removeItem('token'); // Clear the specific stale token
      
      // Prevent infinite redirect loops if already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
// ── Auth ──────────────────────────────────────────────────────
export const auth = {
  signup:        (data)         => api.post('/auth/signup',     data),
  login:         (data)         => api.post('/auth/login',      data),
  me:            ()             => api.get('/auth/me'),
  verifyOtp:     (user_id, otp) => api.post('/auth/verify-otp', { user_id, otp }),
  resendOtp:     (user_id)      => api.post('/auth/resend-otp', { user_id }),
  getProfile:    ()             => api.get('/auth/profile'),
  updateProfile: (data)         => api.put('/auth/profile',     data),
};

// ── Companies ─────────────────────────────────────────────────
export const companies = {
  list:    ()             => api.get('/companies/'),
  connect: (company_name) => api.post('/companies/connect', { company_name }),
  // Refresh masters for already-connected company (new items/ledgers added in Tally)
  refresh: (company_id)   => api.post(`/companies/${company_id}/refresh`),
};

// ── Invoices ──────────────────────────────────────────────────
export const invoices = {
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/invoices/parse', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Mappings ──────────────────────────────────────────────────
export const mappings = {
  suggest:      (data) => api.post('/mappings/suggest',      data),
  save:         (data) => api.post('/mappings/save',         data),
  getByCompany: (id)   => api.get(`/mappings/company/${id}`),
  bulkSuggest:  (data) => api.post('/mappings/bulk-suggest', data),
};

// ── Vouchers ──────────────────────────────────────────────────
export const vouchers = {
  generate: (data) => api.post('/vouchers/generate', data),

  generateAndSend: (data) => api.post('/vouchers/generate-and-send', data),

  download: (data) => api.post('/vouchers/download', data, {
    responseType: 'blob',
    headers: { 'Content-Type': 'application/json' },
  }),

  downloadBulk: (company_name, vouchersArray) =>
    api.post('/vouchers/download-bulk', { company_name, vouchers: vouchersArray }, {
      responseType: 'blob',
      headers: { 'Content-Type': 'application/json' },
    }),

  exportExcel: (data) => api.post('/vouchers/download_excel', data, {
    responseType: 'blob',
    headers: { 'Content-Type': 'application/json' },
  }),
};

// ── Tally ─────────────────────────────────────────────────────
export const tally = {
  connect:     (company_name) => api.post('/tally/connect', { company_name }),
  getItem:     (itemName, companyName) =>
    api.get(`/tally/item/${encodeURIComponent(itemName)}`, { params: { company_name: companyName } }),
  sendVoucher: (xml_content) => api.post('/tally/send-voucher', xml_content),
};

// ── Settings — persist to DB across sessions per company ──────────
export const settings = {
  // Load all settings + invoices on login
  load: (companyId) => 
    api.get(`/settings/?company_id=${companyId}`),

  // Save ledger config / rate-wise / voucher types
  save: (companyId, data) => 
    api.post('/settings/save', { ...data, company_id: companyId }),

  // Invoice persistence
  loadInvoices: (companyId) => 
    api.get(`/settings/invoices?company_id=${companyId}`),
    
  saveInvoices: (companyId, data) => 
    api.post('/settings/invoices', { ...data, company_id: companyId }),
    
  clearInvoices: (companyId) => 
    api.delete(`/settings/invoices?company_id=${companyId}`),
};
// ── Activity Logs ─────────────────────────────────────────────
export const activities = {
  list:    (params) => api.get('/activity/logs', { params }),
  getLogs: (params) => api.get('/activity/logs', { params }),
};

export default api;