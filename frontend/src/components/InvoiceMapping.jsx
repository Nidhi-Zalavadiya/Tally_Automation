// src/components/InvoiceMapping.jsx
import './InvoiceMapping.css';
import React, { useState, useRef } from 'react';
import { useAppState } from '../context/AppStateContext'
import { invoices as invoiceApi, vouchers as voucherApi } from '../services/api';
import ItemMappingGrid from './ItemMappingGrid';

const PAGE_OPTIONS = [5, 10, 15, 20];

const InvoiceMapping = () => {
  const {
    companies, uploadedInvoices, setInvoices, clearInvoices,
    mappingStatus, updateMappingStatus,
  } = useAppState();

  const [step,             setStep]           = useState(uploadedInvoices.length > 0 ? 1 : 0);
  const [selectedInvoice,  setSelectedInvoice] = useState(null);
  const [selectedCoId,     setSelectedCoId]    = useState(companies[0]?.id || '');
  const [uploading,        setUploading]       = useState(false);
  const [error,            setError]           = useState(null);
  const [page,             setPage]            = useState(1);
  const [pageSize,         setPageSize]        = useState(10);
  const fileRef = useRef();

  const activeCompany = companies.find((c) => c.id === Number(selectedCoId));
  const totalPages    = Math.ceil(uploadedInvoices.length / pageSize);
  const paged         = uploadedInvoices.slice((page - 1) * pageSize, page * pageSize);

  // ── Upload ───────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file?.name.endsWith('.json')) { setError('Please upload a .json file'); return; }
    setUploading(true); setError(null);
    try {
      const res = await invoiceApi.upload(file);
      setInvoices(res.data.invoices || []);
      setPage(1);
      setStep(1);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Excel download ───────────────────────────────────────────
  const handleExcel = async () => {
    try {
      const res = await voucherApi.exportExcel({ invoices: uploadedInvoices });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', 'invoices.xlsx');
      document.body.appendChild(a);
      a.click(); a.remove();
    } catch (e) {
      alert('Excel export failed');
      console.log(e);
    }
  };

  const statusBadge = (inv_no) => {
    const s = mappingStatus[inv_no];
    if (!s || s.total === 0) return <span className="badge badge-gray">Pending</span>;
    if (s.mapped === s.total) return <span className="badge badge-green">✓ Done</span>;
    if (s.mapped > 0)         return <span className="badge badge-yellow">{s.mapped}/{s.total}</span>;
    return                           <span className="badge badge-gray">Pending</span>;
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="invoice-mapping">

      {/* Top bar */}
      <div className="mapping-topbar">
        <div className="step-indicator">
          {['Upload', 'Invoices', 'Map Items'].map((label, i) => (
            <span key={i} className={`step ${step === i ? 'active' : step > i ? 'done' : ''}`}>
              <span className="step-num">{step > i ? '✓' : i + 1}</span>{label}
              {i < 2 && <span className="step-sep">›</span>}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Company:</label>
          <select className="form-control" value={selectedCoId} onChange={(e) => setSelectedCoId(Number(e.target.value))} style={{ width: 210 }}>
            <option value="">— select —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Step 0: Upload ── */}
      {step === 0 && (
        <div
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
        >
          <input type="file" ref={fileRef} accept=".json" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
          {uploading ? <p>Decoding JWT invoices…</p> : (
            <>
              <div style={{ fontSize: 48 }}>📤</div>
              <h3>Drop JWT-signed JSON here</h3>
              <p>Array of {'{'}"SignedInvoice":"eyJ…"{'}'} objects</p>
              <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>Browse File</button>
            </>
          )}
        </div>
      )}

      {/* ── Step 1: Invoice List ── */}
      {step === 1 && (
        <>
          <div className="inv-list-toolbar">
            <span>{uploadedInvoices.length} invoice(s) decoded</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Show:</label>
              {PAGE_OPTIONS.map((n) => (
                <button key={n} className={`btn btn-sm ${pageSize === n ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => { setPageSize(n); setPage(1); }}>
                  {n}
                </button>
              ))}
              <button className="btn btn-success btn-sm" onClick={handleExcel}>⬇️ Excel</button>
              <button className="btn btn-outline btn-sm" onClick={() => { clearInvoices(); setStep(0); }}>↩ Re-upload</button>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Invoice No</th><th>Date</th><th>Supplier</th>
                    <th>GSTIN</th><th>Items</th><th>Amount</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((inv, i) => (
                    <tr key={i}>
                      <td className="muted">{(page - 1) * pageSize + i + 1}</td>
                      <td><code>{inv.invoice_no}</code></td>
                      <td>{inv.invoice_date}</td>
                      <td>{inv.supplier?.name || '—'}</td>
                      <td><code style={{ fontSize: 11 }}>{inv.supplier?.gstin || '—'}</code></td>
                      <td><span className="badge badge-blue">{inv.items?.length || 0}</span></td>
                      <td>₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}</td>
                      <td>{statusBadge(inv.invoice_no)}</td>
                      <td>
                        {!activeCompany ? (
                          <span className="muted" style={{ fontSize: 11 }}>Select company ↑</span>
                        ) : (
                          <button className="btn btn-primary btn-sm"
                            onClick={() => { setSelectedInvoice(inv); setStep(2); }}>
                            Map →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn btn-outline btn-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} className={`btn btn-xs ${page === i + 1 ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(i + 1)}>
                    {i + 1}
                  </button>
                ))}
                <button className="btn btn-outline btn-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Step 2: Item Mapping Grid ── */}
      {step === 2 && selectedInvoice && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>← Back to Invoices</button>
            <span style={{ alignSelf: 'center', fontSize: 13 }}>
              Mapping: <strong>{selectedInvoice.invoice_no}</strong> — {selectedInvoice.supplier?.name}
            </span>
          </div>
          {!activeCompany ? (
            <div className="alert alert-error">Please select a company above first.</div>
          ) : (
            <ItemMappingGrid
              invoice={selectedInvoice}
              tallyCompany={activeCompany}
              onMappingUpdate={(mapped, total) => updateMappingStatus(selectedInvoice.invoice_no, mapped, total)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default InvoiceMapping;