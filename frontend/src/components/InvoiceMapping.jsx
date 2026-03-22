// src/components/InvoiceMapping.jsx
import './InvoiceMapping.css';
import React, { useState, useRef, useEffect } from 'react';
import { useAppState } from '../context/AppstateContext';
import { invoices as invoiceApi, vouchers as voucherApi } from '../services/api';
import ItemMappingGrid from './ItemMappingGrid';

const PAGE_OPTIONS = [5, 10, 15, 20];

function getSessionSettings() {
  try {
    const config = JSON.parse(localStorage.getItem('ledger_config') || '{}');
    const types  = JSON.parse(localStorage.getItem('voucher_types') || '{}');
    return { config, types };
  } catch { return { config: {}, types: {} }; }
}

// Build the voucher payload for a single invoice (for the bulk download array)
function buildInvoicePayload(inv, company, config, voucherTypeName, invoiceType) {
  const items = (inv.items || []).map((item) => ({
    stock_item: item.description || item.name || '',
    quantity:   parseFloat(item.quantity ?? item.qty ?? 0),
    unit:       item.unit || 'Nos',
    rate:       parseFloat(item.rate ?? item.unitPrice ?? 0),
    amount:     parseFloat(item.taxable_amount ?? item.taxable ?? item.assAmt ?? 0),
  }));

  const cgstTotal = (inv.items || []).reduce((s, i) => s + parseFloat(i.cgst  ?? 0), 0);
  const sgstTotal = (inv.items || []).reduce((s, i) => s + parseFloat(i.sgst  ?? 0), 0);
  const igstTotal = (inv.items || []).reduce((s, i) => s + parseFloat(i.igst  ?? 0), 0);

  return {
    company_name:    company.company_name,
    invoice_no:      inv.invoice_no,
    invoice_date:    inv.invoice_date,
    supplier_ledger: inv.supplier?.name || 'Supplier',
    voucher_type:    voucherTypeName,
    items,
    is_interstate:   inv.is_interstate || igstTotal > 0,
    cgst_total:      cgstTotal,
    sgst_total:      sgstTotal,
    igst_total:      igstTotal,
    cgst_ledger:     config.cgst_ledger     || 'Input CGST',
    sgst_ledger:     config.sgst_ledger     || 'Input SGST',
    igst_ledger:     config.igst_ledger     || 'Input IGST',
    purchase_ledger: config.purchase_ledger || 'Purchase',
    other_charges:   parseFloat(inv.other_charges || 0),
    round_off:       parseFloat(inv.round_off     || 0),
  };
}

function triggerBlobDownload(blobData, filename) {
  const blob = blobData instanceof Blob
    ? blobData
    : new Blob([blobData], { type: 'application/xml' });
  const url = window.URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const InvoiceMapping = () => {
  const {
    companies, uploadedInvoices, setInvoices, clearInvoices,
    mappingStatus, updateMappingStatus,
    activeCompanyId, setActiveCompanyId, loadInvoicesForCompany // 🟢 Pulled from context
  } = useAppState();

  const [step,            setStep]            = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploading,       setUploading]       = useState(false);
  const [error,           setError]           = useState(null);
  const [page,            setPage]            = useState(1);
  const [pageSize,        setPageSize]        = useState(10);

  // Invoice type + voucher type
  const [invoiceType,    setInvoiceType]   = useState('purchase');
  const [voucherType,    setVoucherType]   = useState('');
  const [showTypeModal,  setShowTypeModal] = useState(false);

  // Multi-invoice XML selection
  const [selectedForXml,  setSelectedForXml]  = useState(new Set());
  const [xmlDownloading,  setXmlDownloading]  = useState(false);

  const fileRef = useRef();

  // 🟢 Dynamically get the active company based on global state
  const activeCompany  = companies.find((c) => c.id === activeCompanyId);
  const totalPages     = Math.ceil(uploadedInvoices.length / pageSize);
  const paged          = uploadedInvoices.slice((page - 1) * pageSize, page * pageSize);

  const { types: sessionTypes } = getSessionSettings();
  const voucherTypeOptions = sessionTypes[invoiceType] ||
    (invoiceType === 'purchase' ? ['Purchase'] : invoiceType === 'sales' ? ['Sales'] : ['Journal']);

  // ════════════════════════════════════════════════════════════════
  // 🟢 NEW: Lifecycle hooks to sync company and invoices
  // ════════════════════════════════════════════════════════════════
  
  // 1. Auto-select first company if none is active
  useEffect(() => {
    if (!activeCompanyId && companies.length > 0) {
      setActiveCompanyId(companies[0].id);
    }
  }, [companies, activeCompanyId, setActiveCompanyId]);



  // 3. Auto-adjust the UI Step: 
  // If no invoices exist, show Upload Screen (0). If invoices exist, show List (1).
  useEffect(() => {
    if (uploadedInvoices.length > 0 && step === 0) {
      setStep(1);
    } else if (uploadedInvoices.length === 0 && step > 0) {
      setStep(0);
    }
  }, [uploadedInvoices.length, step]);


  // ── Upload ─────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file?.name.endsWith('.json')) { setError('Please upload a .json file'); return; }
    setUploading(true); setError(null);
    try {
      const res = await invoiceApi.upload(file);
      setInvoices(res.data.invoices || []);
      setPage(1);
      setSelectedForXml(new Set());
      setStep(1);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Excel ──────────────────────────────────────────────────────
  const handleExcel = async () => {
    try {
      const res = await voucherApi.exportExcel({ invoices: uploadedInvoices });
      triggerBlobDownload(res.data, 'invoices.xlsx');
    } catch (e) { alert('Excel export failed'); console.error(e); }
  };

  // ── XML selection toggles ──────────────────────────────────────
  const toggleXmlSelect = (inv_no) => {
    setSelectedForXml((prev) => {
      const s = new Set(prev);
      s.has(inv_no) ? s.delete(inv_no) : s.add(inv_no);
      return s;
    });
  };
  const toggleAllXml = () => {
    setSelectedForXml(
      selectedForXml.size === uploadedInvoices.length
        ? new Set()
        : new Set(uploadedInvoices.map((i) => i.invoice_no))
    );
  };

  const handleXmlDownload = async () => {
    if (!selectedForXml.size) { alert('Select at least one invoice first'); return; }
    if (!activeCompany)       { alert('Select a company above first');      return; }

    setXmlDownloading(true);
    const { config } = getSessionSettings();
    const resolvedVoucherType = voucherType || voucherTypeOptions[0] || 'Purchase';

    try {
      const invoicesToProcess = uploadedInvoices.filter((inv) =>
        selectedForXml.has(inv.invoice_no)
      );

      const vouchersArray = invoicesToProcess.map((inv) =>
        buildInvoicePayload(inv, activeCompany, config, resolvedVoucherType, invoiceType)
      );

      const res = await voucherApi.downloadBulk(activeCompany.company_name, vouchersArray);

      let filename;
      if (invoicesToProcess.length === 1) {
        const inv      = invoicesToProcess[0];
        const supplier = (inv.supplier?.name || 'supplier').replace(/[^a-z0-9]/gi, '_').substring(0, 25);
        const vtype    = resolvedVoucherType.replace(/\s+/g, '_');
        filename = `${vtype}_${inv.invoice_no}_${supplier}.xml`;
      } else {
        const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const vtype  = resolvedVoucherType.replace(/\s+/g, '_');
        filename = `${vtype}_bulk_${invoicesToProcess.length}invoices_${today}.xml`;
      }

      triggerBlobDownload(res.data, filename);
    } catch (e) {
      const msg = e.response?.data instanceof Blob
        ? await e.response.data.text()
        : (e.response?.data?.detail || e.message);
      alert('XML download failed: ' + msg);
      console.error(e);
    } finally {
      setXmlDownloading(false);
    }
  };

  const statusBadge = (inv_no) => {
    const s = mappingStatus[inv_no];
    if (!s || s.total === 0) return <span className="badge badge-gray">Pending</span>;
    if (s.mapped === s.total) return <span className="badge badge-green">✓ Done</span>;
    if (s.mapped > 0)         return <span className="badge badge-yellow">{s.mapped}/{s.total}</span>;
    return                           <span className="badge badge-gray">Pending</span>;
  };

  const openMapStep = (inv) => {
    setSelectedInvoice(inv);
    setShowTypeModal(true);
  };

  const confirmTypeAndMap = () => {
    setShowTypeModal(false);
    setStep(2);
  };

  return (
    <div className="invoice-mapping">

      {showTypeModal && (
        <div className="modal-overlay" onClick={() => setShowTypeModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, padding: 28 }}>
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>
              📄 Invoice Type for <strong>{selectedInvoice?.invoice_no}</strong>
            </h3>

            <div className="form-group">
              <label className="form-label">Invoice Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['purchase', 'sales', 'journal'].map((t) => (
                  <button key={t}
                    className={`btn btn-sm ${invoiceType === t ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => { setInvoiceType(t); setVoucherType(''); }}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                  >
                    {t === 'purchase' ? '🛒 Purchase' : t === 'sales' ? '💰 Sales' : '📓 Journal'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Voucher Type (from Tally)</label>
              <select className="form-control" value={activeCompanyId || ''}
            onChange={(e) => loadInvoicesForCompany(Number(e.target.value))}
            style={{ width: 210 }}>
            <option value="">— select —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
              {voucherTypeOptions.length <= 1 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Add more types in ⚙️ Settings → Voucher Types
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmTypeAndMap}>
                Map Items →
              </button>
              <button className="btn btn-outline" onClick={() => setShowTypeModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
          
          {/* 🟢 CONNECTED TO GLOBAL activeCompanyId */}
          <select className="form-control" value={activeCompanyId || ''}
            onChange={(e) => setActiveCompanyId(Number(e.target.value))}
            style={{ width: 210 }}>
            <option value="">— select —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>

        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
        >
          <input type="file" ref={fileRef} accept=".json" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])} />
          {uploading ? <p>Decoding JWT invoices…</p> : (
            <>
              <div style={{ fontSize: 48 }}>📤</div>
              <h3>Drop JWT-signed JSON here</h3>
              <p>Array of {'{'}SignedInvoice:"eyJ…"{'}'} objects</p>
              <button className="btn btn-primary"
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                Browse File
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 1: Invoice List */}
      {step === 1 && (
        <>
          <div className="inv-list-toolbar">
            <span>{uploadedInvoices.length} invoice(s) decoded</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Show:</label>
              {PAGE_OPTIONS.map((n) => (
                <button key={n}
                  className={`btn btn-sm ${pageSize === n ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => { setPageSize(n); setPage(1); }}>{n}</button>
              ))}
              <button className="btn btn-success btn-sm" onClick={handleExcel}>⬇️ Excel</button>
              <button className="btn btn-outline btn-sm"
                onClick={() => { clearInvoices(); setStep(0); setSelectedForXml(new Set()); }}>
                ↩ Re-upload
              </button>
            </div>
          </div>

          {selectedForXml.size > 0 && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '10px 14px', background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {selectedForXml.size === 1 ? '1 invoice' : `${selectedForXml.size} invoices`} selected:
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['purchase', 'sales', 'journal'].map((t) => (
                  <button key={t}
                    className={`btn btn-sm ${invoiceType === t ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => { setInvoiceType(t); setVoucherType(''); }}>
                    {t === 'purchase' ? '🛒 Purchase' : t === 'sales' ? '💰 Sales' : '📓 Journal'}
                  </button>
                ))}
              </div>

              <select className="form-control" style={{ width: 180 }}
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}>
                {voucherTypeOptions.map((vt) => <option key={vt} value={vt}>{vt}</option>)}
              </select>

              <button
                className="btn btn-primary btn-sm"
                disabled={!activeCompany || xmlDownloading}
                onClick={handleXmlDownload}
                title={
                  !activeCompany
                    ? 'Select a company first'
                    : selectedForXml.size === 1
                      ? 'Download XML for this invoice'
                      : `Download all ${selectedForXml.size} invoices as one XML file`
                }
              >
                {xmlDownloading
                  ? 'Generating…'
                  : selectedForXml.size === 1
                    ? '⬇️ Download XML'
                    : `⬇️ Download ${selectedForXml.size} invoices as 1 XML`
                }
              </button>
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox"
                        title="Select all for XML download"
                        checked={selectedForXml.size === uploadedInvoices.length && uploadedInvoices.length > 0}
                        onChange={toggleAllXml} />
                    </th>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>GSTIN</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((inv, i) => (
                    <tr key={i}>
                      <td>
                        <input type="checkbox"
                          checked={selectedForXml.has(inv.invoice_no)}
                          onChange={() => toggleXmlSelect(inv.invoice_no)}
                          title="Select for XML" />
                      </td>
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
                          <button className="btn btn-primary btn-sm" onClick={() => openMapStep(inv)}>
                            Map →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn btn-outline btn-xs" disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}>← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i}
                    className={`btn btn-xs ${page === i + 1 ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setPage(i + 1)}>{i + 1}</button>
                ))}
                <button className="btn btn-outline btn-xs" disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Step 2: Map Items */}
      {step === 2 && selectedInvoice && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>← Back to Invoices</button>
            <span style={{ alignSelf: 'center', fontSize: 13 }}>
              Mapping: <strong>{selectedInvoice.invoice_no}</strong> — {selectedInvoice.supplier?.name}
            </span>
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 6,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            }}>
              {invoiceType === 'purchase' ? '🛒' : invoiceType === 'sales' ? '💰' : '📓'}&nbsp;
              {voucherType || voucherTypeOptions[0]}
            </span>
          </div>
          {!activeCompany ? (
            <div className="alert alert-error">Please select a company above first.</div>
          ) : (
            <ItemMappingGrid
              invoice={selectedInvoice}
              tallyCompany={activeCompany}
              invoiceType={invoiceType}
              voucherTypeName={voucherType || voucherTypeOptions[0]}
              onMappingUpdate={(mapped, total) =>
                updateMappingStatus(selectedInvoice.invoice_no, mapped, total)
              }
            />
          )}
        </>
      )}
    </div>
  );
};

export default InvoiceMapping;