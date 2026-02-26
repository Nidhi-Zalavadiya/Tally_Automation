// src/components/ItemMappingGrid.jsx
import './ItemMappingGrid.css';
import React, { useState, useEffect, _useRef } from 'react';
import { mappings as mappingApi, vouchers as voucherApi } from '../services/api';

// ── Tally unit abbreviations ──────────────────────────────────
// Maps full unit name → Tally single-letter suffix used in XML
// e.g. "Box" → "b", "Dozen" → "d", so "5 Box" → "5b" in XML
const UNIT_ABBR = {
  'nos': '', 'pcs': '', 'numbers': '', 'number': '',
  'box': 'b', 'boxes': 'b', 'bx': 'b',
  'dozen': 'd', 'doz': 'd', 'dz': 'd',
  'kg': 'k', 'kgs': 'k', 'kilogram': 'k', 'kilograms': 'k',
  'gm': 'g', 'gram': 'g', 'grams': 'g',
  'ltr': 'l', 'litre': 'l', 'litres': 'l', 'liter': 'l',
  'mtr': 'm', 'meter': 'm', 'metre': 'm', 'meters': 'm',
  'cm': 'c', 'ft': 'f', 'feet': 'f', 'inch': 'i', 'inches': 'i',
  'pair': 'p', 'pairs': 'p', 'set': 's', 'sets': 's',
  'carton': 'ct', 'ctn': 'ct',
  'roll': 'r', 'rolls': 'r',
  'pack': 'pk', 'packs': 'pk', 'packet': 'pk',
  'bag': 'bg', 'bags': 'bg',
  'bundle': 'bn', 'bundles': 'bn',
  'tablet': 'tab', 'tablets': 'tab',
  'strip': 'str', 'strips': 'str',
};

function getTallyQty(qty, primaryUnit, altUnit) {
  // If alt unit selected, use abbr e.g. "5b" for 5 Box
  const unit = (altUnit || primaryUnit || '').toLowerCase().trim();
  const abbr = UNIT_ABBR[unit];
  if (abbr === undefined || abbr === '') return `${qty} ${primaryUnit || ''}`.trim();
  return `${qty}${abbr}`;
}

const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

export default function ItemMappingGrid({ invoice, tallyCompany, onMappingUpdate }) {
  const stockItems = (tallyCompany?.stock_items || []).map((s) => typeof s === 'string' ? s : s.name);
  const units      = (tallyCompany?.units       || []).map((u) => typeof u === 'string' ? u : u.name);
  const ledgers    = (tallyCompany?.ledgers     || []).map((l) => typeof l === 'string' ? l : l.name);

  const [settings, setSettings] = useState({
    cgst_ledger: 'Input CGST', sgst_ledger: 'Input SGST',
    igst_ledger: 'Input IGST', purchase_ledger: 'Purchase',
    is_interstate: invoice.is_interstate || false,
  });
  const [showSettings, setShowSettings] = useState(false);

  // ── Item rows ─────────────────────────────────────────────────
  const [items, setItems] = useState(() =>
    (invoice.items || []).map((item, idx) => {
      const qty     = parseFloat(item.quantity   ?? item.qty   ?? 0);
      const rate    = parseFloat(item.rate       ?? item.price ?? 0);
      const gstRate = parseFloat(item.gst_rate   ?? item.gstRate ?? 0);
      const taxable = qty * rate;
      const gstAmt  = (taxable * gstRate) / 100;
      return {
        id: idx,
        desc:       item.description ?? item.desc ?? item.name ?? '',
        hsn:        item.hsn         ?? item.hsn_code ?? '',
        qty, rate, gstRate,
        uom: item.unit ?? item.uom ?? (units.includes('Nos.') ? 'Nos.' : units[0] || 'Nos.'),
        altUnit:    '',       // alternative unit (Tally alt-unit)
        taxable, cgst: gstAmt / 2, sgst: gstAmt / 2, total: taxable + gstAmt,
        mappedItem: null,
        saved:      false,   // true after saved to DB
      };
    })
  );

  // ── Multi-select ─────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());  // item idx set
  const [bulkItem,    setBulkItem]    = useState('');
  const [bulkGst,     setBulkGst]     = useState('');
  const [bulkAltUnit, setBulkAltUnit] = useState('');

  const [suggestions, setSuggestions] = useState({});
  const [loadingSugg,  setLoadingSugg]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [xmlResult,    setXmlResult]    = useState(null);
  const [pushResult,   setPushResult]   = useState(null);
  const [xmlError,     setXmlError]     = useState(null);

  // ── Fetch bulk suggestions + existing DB mappings on mount ────
  useEffect(() => {
    if (!stockItems.length) return;
    setLoadingSugg(true);
    mappingApi.bulkSuggest({
      company_id:   tallyCompany.id,
      descriptions: items.map((i) => i.desc),
      tally_items:  stockItems,
    })
      .then((res) => {
        const sugg = res.data?.suggestions ?? {};
        setSuggestions(sugg);
        // Auto-apply exact matches (confidence 1.0)
        setItems((prev) => prev.map((item) => {
          const s = sugg[item.desc];
          if (s?.suggested_item && s.confidence >= 1.0 && !item.mappedItem) {
            return { ...item, mappedItem: s.suggested_item };
          }
          return item;
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingSugg(false));

    // Also load existing DB mappings for this company
    mappingApi.getByCompany(tallyCompany.id)
      .then((res) => {
        const dbMap = {};
        (res.data.mappings || []).forEach((m) => { dbMap[m.json_description] = m; });
        setItems((prev) => prev.map((item) => {
          if (!item.mappedItem && dbMap[item.desc]) {
            return { ...item, mappedItem: dbMap[item.desc].tally_item_name, altUnit: dbMap[item.desc].alt_unit || '', saved: true };
          }
          return item;
        }));
      })
      .catch(() => {});
  }, [invoice.invoice_no]);

  // ── Notify parent ─────────────────────────────────────────────
  useEffect(() => {
    const mapped = items.filter((i) => i.mappedItem).length;
    onMappingUpdate(mapped, items.length);
  }, [items]);

  // ── Item update helpers ───────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const arr  = [...prev];
      const item = { ...arr[idx], [field]: value };
      if (['qty', 'rate', 'gstRate'].includes(field)) {
        const taxable = item.qty * item.rate;
        const gstAmt  = (taxable * item.gstRate) / 100;
        item.taxable  = taxable; item.cgst = gstAmt / 2;
        item.sgst     = gstAmt / 2; item.total = taxable + gstAmt;
      }
      arr[idx] = item; return arr;
    });
  };

  // ── Multi-select toggle ───────────────────────────────────────
  const toggleSelect = (idx) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  };
  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)));
  };

  // Apply bulk changes to selected rows
  const applyBulk = () => {
    setItems((prev) => prev.map((item, idx) => {
      if (!selected.has(idx)) return item;
      const updated = { ...item };
      if (bulkItem)    updated.mappedItem = bulkItem;
      if (bulkGst)     { updated.gstRate = parseFloat(bulkGst); const tax = updated.qty * updated.rate; const g = (tax * updated.gstRate)/100; updated.taxable = tax; updated.cgst = g/2; updated.sgst = g/2; updated.total = tax + g; }
      if (bulkAltUnit) updated.altUnit = bulkAltUnit;
      return updated;
    }));
    setBulkItem(''); setBulkGst(''); setBulkAltUnit('');
    setSelected(new Set());
  };

  // ── Build voucher payload ─────────────────────────────────────
  const buildPayload = () => {
    const mapped = items.filter((i) => i.mappedItem);
    return {
      company_name:    tallyCompany.company_name,
      invoice_no:      invoice.invoice_no,
      invoice_date:    invoice.invoice_date,
      supplier_ledger: invoice.supplier?.name ?? 'Supplier',
      items: mapped.map((i) => ({
        stock_item: i.mappedItem,
        // Tally qty format: e.g. "5b" for 5 Box, "10" for Nos
        quantity:   i.altUnit
                      ? getTallyQty(i.qty, i.uom, i.altUnit)
                      : i.qty,
        unit:       i.altUnit || i.uom,
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
      other_charges:   parseFloat(invoice.other_charges || 0),
      round_off:       parseFloat(invoice.round_off     || 0),
    };
  };

  // ── Save mappings to DB ───────────────────────────────────────
  const handleSave = async () => {
    const toSave = items.filter((i) => i.mappedItem && !i.saved);
    if (!toSave.length) { alert('No new mappings to save'); return; }
    setSaving(true);
    try {
      await Promise.all(toSave.map((item) =>
        mappingApi.save({
          company_id:       tallyCompany.id,
          json_description: item.desc,
          tally_item_name:  item.mappedItem,
          alt_unit:         item.altUnit || "",
          last_sales_rate:  item.rate,
        })
      ));
      setItems((prev) => prev.map((i) => i.mappedItem ? { ...i, saved: true } : i));
      alert(`✅ ${toSave.length} mapping(s) saved to DB`);
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!items.some((i) => i.mappedItem)) { alert('Map at least one item first'); return; }
    setXmlError(null); setXmlResult(null);
    try { const r = await voucherApi.generate(buildPayload()); setXmlResult(r.data); }
    catch (e) { setXmlError(e.response?.data?.detail || e.message); }
  };

  const handleDownloadXml = async () => {
    if (!items.some((i) => i.mappedItem)) return;
    try {
      const res = await voucherApi.download(buildPayload());
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.setAttribute('download', `voucher_${invoice.invoice_no}.xml`);
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { alert('XML download failed');
      console.log(e);
     }
  };

  const handlePush = async () => {
    if (!items.some((i) => i.mappedItem)) return;
    setPushResult(null);
    try { const r = await voucherApi.generateAndSend(buildPayload()); setPushResult(r.data); }
    catch (e) { alert('Push failed: ' + (e.response?.data?.detail || e.message)); }
  };

  const mappedCount = items.filter((i) => i.mappedItem).length;
  const grandTotal  = items.reduce((s, i) => s + i.total, 0);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="item-grid-wrap">

      {/* Toolbar */}
      <div className="grid-toolbar">
        <div>
          <strong>{invoice.invoice_no}</strong>
          <span className="muted"> — {invoice.supplier?.name}</span>
          {loadingSugg && <span className="sugg-loading"> ⚡ loading suggestions…</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSettings(!showSettings)}>⚙️ Ledgers</button>
          <button className="btn btn-outline btn-sm" onClick={handleSave} disabled={saving || !mappedCount}>
            {saving ? 'Saving…' : '💾 Save Mappings'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleGenerate} disabled={!mappedCount}>📋 Preview XML</button>
          <button className="btn btn-outline btn-sm" onClick={handleDownloadXml} disabled={!mappedCount}>⬇️ Download XML</button>
          <button className="btn btn-primary btn-sm"  onClick={handlePush} disabled={!mappedCount}>🚀 Push to Tally</button>
        </div>
      </div>

      {/* Ledger Settings */}
      {showSettings && (
        <div className="settings-panel-inline">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[
              { k: 'cgst_ledger',     l: 'CGST' },
              { k: 'sgst_ledger',     l: 'SGST' },
              { k: 'igst_ledger',     l: 'IGST' },
              { k: 'purchase_ledger', l: 'Purchase' },
            ].map(({ k, l }) => (
              <div key={k} className="form-group" style={{ marginBottom: 0, minWidth: 170 }}>
                <label className="form-label">{l} Ledger</label>
                <select className="form-control" value={settings[k]} onChange={(e) => setSettings((p) => ({ ...p, [k]: e.target.value }))}>
                  <option value={settings[k]}>{settings[k]}</option>
                  {ledgers.filter((l) => l !== settings[k]).map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            ))}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Type</label>
              <select className="form-control" style={{ width: 130 }}
                value={settings.is_interstate ? 'igst' : 'cgst'}
                onChange={(e) => setSettings((p) => ({ ...p, is_interstate: e.target.value === 'igst' }))}>
                <option value="cgst">Intrastate (CGST+SGST)</option>
                <option value="igst">Interstate (IGST)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Multi-select bulk actions bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="muted">{selected.size} selected</span>
          <select className="cell-select" value={bulkItem} onChange={(e) => setBulkItem(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">— Bulk Map Item —</option>
            {stockItems.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="cell-select" value={bulkGst} onChange={(e) => setBulkGst(e.target.value)} style={{ width: 90 }}>
            <option value="">— GST % —</option>
            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
          <select className="cell-select" value={bulkAltUnit} onChange={(e) => setBulkAltUnit(e.target.value)} style={{ width: 120 }}>
            <option value="">— Alt Unit —</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={applyBulk}
            disabled={!bulkItem && !bulkGst && !bulkAltUnit}>Apply</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Banners */}
      {pushResult?.success && <div className="alert alert-success">✅ {pushResult.message}</div>}
      {xmlError            && <div className="alert alert-error">⚠️ {xmlError}</div>}

      {/* XML Preview */}
      {xmlResult && (
        <div className="xml-preview">
          <div className="xml-preview-header">
            <strong>XML — {xmlResult.invoice_no}</strong>
            <span>₹{Number(xmlResult.total_amount).toLocaleString('en-IN')}</span>
            <button className="btn btn-outline btn-xs" onClick={() => setXmlResult(null)}>✕</button>
          </div>
          <pre className="xml-pre">{xmlResult.xml_content}</pre>
        </div>
      )}

      {/* Table */}
      <div className="table-scroll">
        <table className="mapping-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={selected.size === items.length && items.length > 0}
                  onChange={toggleAll} title="Select all" />
              </th>
              <th>#</th>
              <th>Description</th>
              <th>HSN</th>
              <th>Qty</th>
              <th>Unit (Tally)</th>
              <th>Alt. Unit</th>
              <th>Rate (₹)</th>
              <th>Taxable</th>
              <th>GST %</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Total</th>
              <th>Map to Tally Item ↓</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const sugg = suggestions[item.desc];
              const tallyQty = getTallyQty(item.qty, item.uom, item.altUnit);
              return (
                <tr key={idx} className={item.mappedItem ? (item.saved ? 'row-saved' : 'row-mapped') : 'row-pending'}>
                  <td>
                    <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} />
                  </td>
                  <td className="muted">{idx + 1}</td>
                  <td><span className="desc-cell" title={item.desc}>{item.desc || '—'}</span></td>
                  <td><code style={{ fontSize: 11 }}>{item.hsn || '—'}</code></td>

                  {/* Qty */}
                  <td>
                    <input className="cell-input" type="number" value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                    {item.altUnit && <div className="tally-qty-preview">→ {tallyQty}</div>}
                  </td>

                  {/* Primary Unit — only Tally units */}
                  <td>
                    <select className="cell-select" value={item.uom} onChange={(e) => updateItem(idx, 'uom', e.target.value)}>
                      {units.length ? units.map((u) => <option key={u} value={u}>{u}</option>)
                        : <option value={item.uom}>{item.uom}</option>}
                    </select>
                  </td>

                  {/* Alt Unit — only Tally units */}
                  <td>
                    <select className="cell-select" value={item.altUnit} onChange={(e) => updateItem(idx, 'altUnit', e.target.value)}>
                      <option value="">— none —</option>
                      {units.filter((u) => u !== item.uom).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>

                  <td className="num">{item.rate.toFixed(2)}</td>
                  <td className="num">{item.taxable.toFixed(2)}</td>

                  {/* GST % */}
                  <td>
                    <select className="cell-select" style={{ width: 68 }} value={item.gstRate}
                      onChange={(e) => updateItem(idx, 'gstRate', parseFloat(e.target.value))}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>

                  <td className="num">{item.cgst.toFixed(2)}</td>
                  <td className="num">{item.sgst.toFixed(2)}</td>
                  <td className="num total-cell">{item.total.toFixed(2)}</td>

                  {/* Map column */}
                  <td className="map-cell">
                    <select className="cell-select map-select" value={item.mappedItem || ''}
                      onChange={(e) => updateItem(idx, 'mappedItem', e.target.value || null)}>
                      <option value="">— select —</option>
                      {stockItems.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {sugg?.suggested_item && !item.mappedItem && (
                      <button className="sugg-chip" onClick={() => updateItem(idx, 'mappedItem', sugg.suggested_item)}
                        title={`Confidence: ${Math.round((sugg.confidence || 0) * 100)}%`}>
                        ⚡ {sugg.suggested_item}
                      </button>
                    )}
                    {item.mappedItem && (
                      <span className={`mapped-indicator ${item.saved ? 'saved' : ''}`}>
                        {item.saved ? '✓ Saved' : '• Mapped'} — {item.mappedItem}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="grid-footer">
        <span>{items.length} items | {mappedCount} mapped | {items.length - mappedCount} pending</span>
        <strong>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>
  );
}