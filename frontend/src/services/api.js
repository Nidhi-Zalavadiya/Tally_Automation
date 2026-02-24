import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Tally ─────────────────────────────────────────────────────────────────────
// POST /api/tally/connect  → { company_name, ledgers, stock_items, units }
// GET  /api/tally/item/:name?company_name=
// POST /api/tally/send-voucher
export const tally = {
  connect:     (company_name) => api.post('/tally/connect', { company_name }),
  getItem:     (itemName, companyName) =>
    api.get(`/tally/item/${encodeURIComponent(itemName)}`, { params: { company_name: companyName } }),
  sendVoucher: (xml_content) => api.post('/tally/send-voucher', xml_content),
};

// Placeholder for missing activities API
export const activities = {
  getLogs: () => Promise.resolve({ data: [] }), 
  // Add any other methods ActivityLogs.jsx is calling here
};
// ── Invoices ──────────────────────────────────────────────────────────────────
// POST /api/invoices/parse  (multipart) → { invoices[], total_count }
// POST /api/invoices/parse-text         → { invoices[], total_count }
export const invoices = {
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/invoices/parse', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  parseText: (jsonData) => api.post('/invoices/parse-text', jsonData),
};

// ── Mappings ──────────────────────────────────────────────────────────────────
// POST /api/mappings/suggest
// POST /api/mappings/save
// GET  /api/mappings/company/:id
// POST /api/mappings/bulk-suggest
export const mappings = {
  suggest:      (data) => api.post('/mappings/suggest', data),
  save:         (data) => api.post('/mappings/save', data),
  getByCompany: (id)   => api.get(`/mappings/company/${id}`),
  bulkSuggest:  (data) => api.post('/mappings/bulk-suggest', data),
};

// ── Vouchers ──────────────────────────────────────────────────────────────────
// POST /api/vouchers/generate           → { xml_content, invoice_no, total_amount }
// POST /api/vouchers/generate-and-send  → { success, message, invoice_no }
// POST /api/vouchers/download           → XML blob
// POST /api/vouchers/download_excel     → Excel blob
export const vouchers = {
  generate:        (data) => api.post('/vouchers/generate', data),
  generateAndSend: (data) => api.post('/vouchers/generate-and-send', data),
  download:        (data) => api.post('/vouchers/download', data, { responseType: 'blob' }),
  exportExcel:     (data) => api.post('/vouchers/download_excel', data, { responseType: 'blob' }),
};

export default api;