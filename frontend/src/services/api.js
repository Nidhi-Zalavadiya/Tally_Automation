// src/services/api.js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url    = err.config?.url || '';
    const status = err.response?.status;
    if (status === 401 && url.includes('/auth/me')) {
      sessionStorage.clear();
      window.location.reload();
    }
    return Promise.reject(err);
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

  // Single invoice XML download
  download: (data) => api.post('/vouchers/download', data, {
    responseType: 'blob',
    headers: { 'Content-Type': 'application/json' },
  }),

  // Smart bulk: 1 invoice → single file, N invoices → combined file
  // Backend endpoint /download-bulk handles both cases
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

// ── Activity Logs ─────────────────────────────────────────────
export const activities = {
  list:    (params) => api.get('/activity/logs', { params }),
  getLogs: (params) => api.get('/activity/logs', { params }),
};

export default api;