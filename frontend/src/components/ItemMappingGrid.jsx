// src/components/ItemMappingGrid.jsx
import React, { useState, useEffect } from 'react';
import { mappings as mappingApi, vouchers as voucherApi } from '../services/api';
import './Itemmappinggrid.css'


const ItemMappingGrid = ({ invoice, tallyCompany, onMappingUpdate }) => {
  // ── Derive stock items / units from the connected company object ────────────
  const stockItems = (tallyCompany?.stock_items || []).map((s) =>
    typeof s === 'string' ? s : s.name
  );
  const units = (tallyCompany?.units || []).map((u) =>
    typeof u === 'string' ? u : u.name
  );
  const ledgers = (tallyCompany?.ledgers || []).map((l) =>
    typeof l === 'string' ? l : l.name
  );

  // ── Settings state (tax ledgers + purchase ledger) ──────────────────────────
  const [settings, setSettings] = useState({
    cgst_ledger:     'Input CGST',
    sgst_ledger:     'Input SGST',
    igst_ledger:     'Input IGST',
    purchase_ledger: 'Purchase',
    is_interstate:   false,
  });
  const [showSettings, setShowSettings] = useState(false);

  // ── Items state ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState(() =>
    (invoice.items || []).map((item, idx) => {
      const qty      = parseFloat(item.quantity  ?? item.qty  ?? 0);
      const rate     = parseFloat(item.rate      ?? item.price ?? 0);
      const gstRate  = parseFloat(item.gst_rate  ?? item.gstRate ?? item.tax_rate ?? 0);
      const taxable  = qty * rate;
      const gstAmt   = (taxable * gstRate) / 100;
      return {
        id:          idx,
        desc:        item.product_desc  ?? item.productDesc  ?? item.description ?? item.name ?? '',
        hsn:         item.hsn_code      ?? item.hsnCode      ?? item.hsn          ?? '',
        qty,
        rate,
        gstRate,
        uom:         item.unit          ?? item.uom          ?? 'Nos',
        taxable,
        cgst:        gstAmt / 2,
        sgst:        gstAmt / 2,
        total:       taxable + gstAmt,
        mappedItem:  null,   // tally stock item name, set by user
        tallyRate:   null,
      };
    })
  );

  const [suggestions, setSuggestions]   = useState({});
  const [loadingSugg, setLoadingSugg]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [xmlResult, setXmlResult]       = useState(null);  // { xml_content, invoice_no, total_amount }
  const [xmlError, setXmlError]         = useState(null);
  const [pushResult, setPushResult]     = useState(null);

  // ── Bulk suggestions on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!stockItems.length) return;
    setLoadingSugg(true);

    mappingApi.bulkSuggest({
      company_id:  tallyCompany?.id ?? 1,
      descriptions: items.map((i) => i.desc),
      tally_items:  stockItems,
    })
      .then((res) => setSuggestions(res.data?.suggestions ?? {}))
      .catch(() => {})
      .finally(() => setLoadingSugg(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.invoice_no, stockItems.length]);

  // ── Notify parent on every mapping change ───────────────────────────────────
  useEffect(() => {
    const mapped = items.filter((i) => i.mappedItem).length;
    onMappingUpdate(mapped, items.length);
  }, [items, onMappingUpdate]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const arr  = [...prev];
      const item = { ...arr[idx], [field]: value };

      if (['qty', 'rate', 'gstRate'].includes(field)) {
        const taxable = item.qty * item.rate;
        const gstAmt  = (taxable * item.gstRate) / 100;
        item.taxable  = taxable;
        item.cgst     = gstAmt / 2;
        item.sgst     = gstAmt / 2;
        item.total    = taxable + gstAmt;
      }
      arr[idx] = item;
      return arr;
    });
  };

  const applyMapping = (idx, tallyItemName) => {
    updateItem(idx, 'mappedItem', tallyItemName || null);
  };

  // ── Build voucher payload (matches GenerateVoucherRequest exactly) ──────────
  const buildPayload = () => {
    const mapped = items.filter((i) => i.mappedItem);

    return {
      company_name:    tallyCompany.company_name,
      invoice_no:      invoice.invoice_no,
      invoice_date:    invoice.invoice_date,
      supplier_ledger: invoice.supplier?.name ?? 'Supplier',
      items: mapped.map((i) => ({
        stock_item: i.mappedItem,
        quantity:   i.qty,
        unit:       i.uom,
        rate:       i.rate,
        amount:     i.taxable,
      })),
      is_interstate:   settings.is_interstate,
      cgst_total:      mapped.reduce((s, i) => s + i.cgst, 0),
      sgst_total:      mapped.reduce((s, i) => s + i.sgst, 0),
      igst_total:      0,
      cgst_ledger:     settings.cgst_ledger,
      sgst_ledger:     settings.sgst_ledger,
      igst_ledger:     settings.igst_ledger,
      purchase_ledger: settings.purchase_ledger,
      other_charges:   0,
      round_off:       0,
    };
  };

  // ── Save mappings to DB ─────────────────────────────────────────────────────
  const handleSaveMappings = async () => {
    const mapped = items.filter((i) => i.mappedItem);
    if (!mapped.length) return;
    setSaving(true);
    try {
      await Promise.all(
        mapped.map((item) =>
          mappingApi.save({
            company_id:      tallyCompany?.id ?? 1,
            json_description: item.desc,
            tally_item_name:  item.mappedItem,
            last_sales_rate:  item.rate,
          })
        )
      );
      alert(`✅ ${mapped.length} mapping(s) saved`);
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  // ── Generate XML (POST /api/vouchers/generate) ─────────────────────────────
  const handleGenerateXml = async () => {
    if (!items.some((i) => i.mappedItem)) { alert('Map at least one item first'); return; }
    setXmlError(null);
    setXmlResult(null);
    try {
      const res = await voucherApi.generate(buildPayload());
      setXmlResult(res.data); // { xml_content, invoice_no, total_amount }
    } catch (e) {
      setXmlError(e.response?.data?.detail || e.message);
    }
  };

  // ── Download XML file (POST /api/vouchers/download) ────────────────────────
  const handleDownloadXml = async () => {
    if (!items.some((i) => i.mappedItem)) { alert('Map at least one item first'); return; }
    try {
      const res  = await voucherApi.download(buildPayload());
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `voucher_${invoice.invoice_no}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert('Download failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  // ── Generate + Send to Tally (POST /api/vouchers/generate-and-send) ─────────
  const handlePushToTally = async () => {
    if (!items.some((i) => i.mappedItem)) { alert('Map at least one item first'); return; }
    setPushResult(null);
    try {
      const res = await voucherApi.generateAndSend(buildPayload());
      setPushResult(res.data); // { success, message, invoice_no }
    } catch (e) {
      alert('Push failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  const mappedCount = items.filter((i) => i.mappedItem).length;
  const grandTotal  = items.reduce((s, i) => s + i.total, 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="item-grid-wrap">

      {/* ── Toolbar ── */}
      <div className="grid-toolbar">
        <div>
          <strong>{invoice.invoice_no}</strong>&nbsp;
          <span className="muted">
            {invoice.supplier?.name} | {invoice.supplier?.gstin}
          </span>
          {loadingSugg && <span className="sugg-loading"> ⚡ loading suggestions…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSettings(!showSettings)}>
            ⚙️ Ledgers
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleSaveMappings} disabled={saving || !mappedCount}>
            {saving ? 'Saving…' : '💾 Save Mappings'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleGenerateXml} disabled={!mappedCount}>
            📋 Preview XML
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleDownloadXml} disabled={!mappedCount}>
            ⬇️ Download XML
          </button>
          <button className="btn btn-primary btn-sm" onClick={handlePushToTally} disabled={!mappedCount}>
            🚀 Push to Tally
          </button>
        </div>
      </div>

      {/* ── Settings Panel (ledger pickers) ── */}
      {showSettings && (
        <div className="settings-panel-inline">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[
              { key: 'cgst_ledger',     label: 'CGST Ledger'     },
              { key: 'sgst_ledger',     label: 'SGST Ledger'     },
              { key: 'igst_ledger',     label: 'IGST Ledger'     },
              { key: 'purchase_ledger', label: 'Purchase Ledger' },
            ].map((f) => (
              <div key={f.key} className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                <label className="form-label">{f.label}</label>
                <select
                  className="form-control"
                  value={settings[f.key]}
                  onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                >
                  <option value={settings[f.key]}>{settings[f.key]}</option>
                  {ledgers.filter((l) => l !== settings[f.key]).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Interstate?</label>
              <select
                className="form-control"
                value={settings.is_interstate ? 'yes' : 'no'}
                onChange={(e) => setSettings((p) => ({ ...p, is_interstate: e.target.value === 'yes' }))}
                style={{ width: 90 }}
              >
                <option value="no">No (CGST+SGST)</option>
                <option value="yes">Yes (IGST)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Result banners ── */}
      {pushResult?.success && (
        <div className="alert alert-success">
          ✅ {pushResult.message}
        </div>
      )}
      {xmlError && <div className="alert alert-error">⚠️ {xmlError}</div>}

      {/* ── XML Preview ── */}
      {xmlResult && (
        <div className="xml-preview">
          <div className="xml-preview-header">
            <strong>XML Preview — {xmlResult.invoice_no}</strong>
            <span>Total: ₹{Number(xmlResult.total_amount).toLocaleString('en-IN')}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setXmlResult(null)}>✕ Close</button>
          </div>
          <pre className="xml-pre">{xmlResult.xml_content}</pre>
        </div>
      )}

      {/* ── Mapping Table ── */}
      <div className="table-scroll">
        <table className="mapping-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN</th>
              <th>Qty</th>
              <th>UOM</th>
              <th>Rate (₹)</th>
              <th>Taxable (₹)</th>
              <th>GST %</th>
              <th>CGST (₹)</th>
              <th>SGST (₹)</th>
              <th>Total (₹)</th>
              <th>Map to Tally Item ↓</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const sugg = suggestions[idx] ?? suggestions[item.desc];
              return (
                <tr key={idx} className={item.mappedItem ? 'row-mapped' : 'row-pending'}>
                  <td className="muted">{idx + 1}</td>

                  {/* Description */}
                  <td title={item.desc} style={{ maxWidth: 180 }}>
                    <span className="desc-cell">{item.desc || '—'}</span>
                  </td>

                  {/* HSN */}
                  <td><code style={{ fontSize: 11 }}>{item.hsn || '—'}</code></td>

                  {/* Qty (editable) */}
                  <td>
                    <input
                      type="number"
                      className="cell-input"
                      value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)}
                    />
                  </td>

                  {/* UOM */}
                  <td>
                    <select
                      className="cell-select"
                      value={item.uom}
                      onChange={(e) => updateItem(idx, 'uom', e.target.value)}
                    >
                      {['Nos', 'Kgs', 'Pcs', 'Ltr', 'Mtr',
                        ...units.filter((u) => !['Nos','Kgs','Pcs','Ltr','Mtr'].includes(u))
                      ].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>

                  {/* Rate */}
                  <td className="num">{item.rate.toFixed(2)}</td>

                  {/* Taxable */}
                  <td className="num">{item.taxable.toFixed(2)}</td>

                  {/* GST % (editable) */}
                  <td>
                    <select
                      className="cell-select"
                      value={item.gstRate}
                      onChange={(e) => updateItem(idx, 'gstRate', parseFloat(e.target.value))}
                      style={{ width: 64 }}
                    >
                      {[0, 5, 12, 18, 28].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </td>

                  {/* CGST */}
                  <td className="num">{item.cgst.toFixed(2)}</td>

                  {/* SGST */}
                  <td className="num">{item.sgst.toFixed(2)}</td>

                  {/* Total */}
                  <td className="num total-cell">{item.total.toFixed(2)}</td>

                  {/* Mapping Column */}
                  <td className="map-cell">
                    <select
                      className="cell-select map-select"
                      value={item.mappedItem || ''}
                      onChange={(e) => applyMapping(idx, e.target.value)}
                    >
                      <option value="">— select item —</option>
                      {stockItems.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    {/* Suggestion chip */}
                    {sugg?.suggested_item && !item.mappedItem && (
                      <button
                        className="sugg-chip"
                        onClick={() => applyMapping(idx, sugg.suggested_item)}
                        title={`Confidence: ${Math.round((sugg.confidence || 0) * 100)}%`}
                      >
                        ⚡ {sugg.suggested_item}
                      </button>
                    )}

                    {/* Mapped indicator */}
                    {item.mappedItem && (
                      <span className="mapped-indicator">✓ {item.mappedItem}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="grid-footer">
        <span>{items.length} items &nbsp;|&nbsp; {mappedCount} mapped &nbsp;|&nbsp; {items.length - mappedCount} pending</span>
        <strong>Grand Total: ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>
  );
};

export default ItemMappingGrid;