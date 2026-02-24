// src/components/InvoiceMapping.jsx
import React, { useState, useRef } from 'react';
import ItemMappingGrid from './ItemMappingGrid';
import { invoices as invoiceApi } from '../services/api';
import './Invoicemapping.css'
const InvoiceMapping = ({ companies }) => {
  const [step, setStep]                   = useState(0); // 0=upload  1=list  2=mapping
  const [parsedInvoices, setParsedInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [error, setError]                   = useState(null);
  const [mappingStatus, setMappingStatus]   = useState({}); // { [invoice_no]: { mapped, total } }
  const [selectedCompanyName, setSelectedCompanyName] = useState(
    companies[0]?.company_name || ''
  );
  const fileRef = useRef();

  // The company object carries ledgers/stock_items/units from /api/tally/connect
  const activeCompany = companies.find((c) => c.company_name === selectedCompanyName);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.json')) {
      setError('Please upload a .json file');
      return;
    }
    setUploading(true);
    setError(null);

    try {
      // POST /api/invoices/parse  → { invoices[], total_count }
      const res  = await invoiceApi.upload(file);
      const data = res.data;

      setParsedInvoices(data.invoices || []);

      // init mapping status
      const status = {};
      (data.invoices || []).forEach((inv) => {
        status[inv.invoice_no] = { total: inv.items?.length || 0, mapped: 0 };
      });
      setMappingStatus(status);
      setStep(1);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  // ── Status helpers ──────────────────────────────────────────────────────────
  const statusBadge = (inv_no) => {
    const s = mappingStatus[inv_no];
    if (!s) return null;
    if (s.mapped === s.total && s.total > 0) return <span className="badge badge-green">✓ Complete</span>;
    if (s.mapped > 0)                          return <span className="badge badge-yellow">Partial {s.mapped}/{s.total}</span>;
    return                                            <span className="badge badge-gray">Pending</span>;
  };

  // called by ItemMappingGrid when a row is mapped/unmapped
  const onMappingUpdate = (inv_no, mapped, total) => {
    setMappingStatus((prev) => ({ ...prev, [inv_no]: { mapped, total } }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="invoice-mapping">

      {/* Top bar */}
      <div className="mapping-topbar">
        <div className="step-indicator">
          {['Upload', 'Invoices', 'Map Items'].map((label, i) => (
            <span key={i} className={`step ${step === i ? 'active' : step > i ? 'done' : ''}`}>
              <span className="step-num">{step > i ? '✓' : i + 1}</span>
              {label}
              {i < 2 && <span className="step-sep">›</span>}
            </span>
          ))}
        </div>

        {/* Company selector — only from connected companies this session */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>
            Tally Company:
          </label>
          <select
            className="form-control"
            value={selectedCompanyName}
            onChange={(e) => setSelectedCompanyName(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">— select —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.company_name}>{c.company_name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Step 0: Upload ── */}
      {step === 0 && (
        <div
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            type="file"
            ref={fileRef}
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploading ? (
            <p>Decoding signed invoices…</p>
          ) : (
            <>
              <div style={{ fontSize: 40 }}>📤</div>
              <h3>Drop JWT-signed JSON here</h3>
              <p>or click to browse</p>
              <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                Browse File
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 1: Invoice List ── */}
      {step === 1 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span>{parsedInvoices.length} invoice(s) decoded</span>
            <button className="btn btn-outline btn-sm" onClick={() => { setStep(0); setParsedInvoices([]); }}>
              ↩ Re-upload
            </button>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>GSTIN</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Mapping</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedInvoices.map((inv, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><code>{inv.invoice_no}</code></td>
                      <td>{inv.invoice_date}</td>
                      <td>{inv.supplier?.name || '—'}</td>
                      <td><code style={{ fontSize: 11 }}>{inv.supplier?.gstin || '—'}</code></td>
                      <td><span className="badge badge-blue">{inv.items?.length || 0}</span></td>
                      <td>₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}</td>
                      <td>{statusBadge(inv.invoice_no)}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => { setSelectedInvoice(inv); setStep(2); }}
                        >
                          Map →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Step 2: Item Mapping Grid ── */}
      {step === 2 && selectedInvoice && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>← Back</button>
            <span style={{ alignSelf: 'center', fontSize: 13 }}>
              Mapping: <strong>{selectedInvoice.invoice_no}</strong>
              &nbsp;—&nbsp;{selectedInvoice.supplier?.name}
            </span>
          </div>

          {!activeCompany ? (
            <div className="alert alert-error">
              No Tally company selected. Go to Tally Connect first.
            </div>
          ) : (
            <ItemMappingGrid
              invoice={selectedInvoice}
              tallyCompany={activeCompany}   // carries stock_items[], ledgers[], units[]
              onMappingUpdate={(mapped, total) =>
                onMappingUpdate(selectedInvoice.invoice_no, mapped, total)
              }
            />
          )}
        </>
      )}
    </div>
  );
};

export default InvoiceMapping;