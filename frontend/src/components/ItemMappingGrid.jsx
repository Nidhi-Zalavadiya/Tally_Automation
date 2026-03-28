// src/components/ItemMappingGrid.jsx
import './ItemMappingGrid.css';
import React, { useState, useEffect, useRef } from 'react';
import { mappings as mappingApi, vouchers as voucherApi } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

const INDIAN_STATES = [
  'Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar',
  'Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand',
  'Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra',
  'Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal',
];

const UNIT_ABBR = {
  'nos':'','pcs':'','numbers':'','number':'',
  'box':'b','boxes':'b','bx':'b',
  'dozen':'d','doz':'d','dz':'d',
  'kg':'k','kgs':'k','kilogram':'k','kilograms':'k',
  'gm':'g','gram':'g','grams':'g',
  'ltr':'l','litre':'l','litres':'l','liter':'l',
  'mtr':'m','meter':'m','metre':'m','meters':'m',
  'cm':'c','ft':'f','feet':'f','inch':'i','inches':'i',
  'pair':'p','pairs':'p','set':'s','sets':'s',
  'carton':'ct','ctn':'ct','roll':'r','rolls':'r',
  'pack':'pk','packs':'pk','packet':'pk',
  'bag':'bg','bags':'bg','bundle':'bn','bundles':'bn',
  'tablet':'tab','tablets':'tab','strip':'str','strips':'str',
  'crt':'c'
};

function getTallyQty(qty, primaryUnit, altUnit) {
  const unit = (altUnit || primaryUnit || '').toLowerCase().trim();
  const abbr = UNIT_ABBR[unit];
  if (abbr === undefined || abbr === '') return `${qty} ${primaryUnit || ''}`.trim();
  return `${qty}${abbr}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy match — score how well needle matches haystack (0-1)
// Used for party name suggestion: "M/S. Jayesh Traders" → "Jayesh Traders"
// ─────────────────────────────────────────────────────────────────────────────
function fuzzyScore(needle, haystack) {
  if (!needle || !haystack) return 0;
  const n = needle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const h = haystack.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (h === n) return 1.0;
  if (h.includes(n) || n.includes(h)) return 0.9;

  // Word-overlap score
  const nWords = n.split(/\s+/).filter(Boolean);
  const hWords = h.split(/\s+/).filter(Boolean);
  const overlap = nWords.filter((w) => hWords.some((hw) => hw.includes(w) || w.includes(hw)));
  const score = overlap.length / Math.max(nWords.length, hWords.length);
  return score;
}

function fuzzyMatchLedgers(partyName, ledgers, topN = 6) {
  return ledgers
    .map((l) => ({ name: l, score: fuzzyScore(partyName, l) }))
    .filter((x) => x.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract supplier/party state from e-invoice data
// Checks multiple possible field locations the parsed e-invoice might use
// ─────────────────────────────────────────────────────────────────────────────
function extractPartyState(invoice) {
  // Direct fields
  const candidates = [
    invoice.supplier?.state,
    invoice.supplier?.state_name,
    invoice.seller?.state,
    invoice.seller?.state_name,
    invoice.SellerDtls?.State,
    invoice.SellerDtls?.Stcd,
    // Sometimes stored at top level
    invoice.supplier_state,
    invoice.seller_state,
    invoice.party_state,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim()) return c.trim();
  }
  // Derive from GSTIN first two digits (state code)
  const gstin = invoice.supplier?.gstin || invoice.seller_gstin || '';
  if (gstin && gstin.length >= 2) {
    const code = gstin.substring(0, 2);
    return GSTIN_STATE_MAP[code] || '';
  }
  return '';
}

// GSTIN state code → state name mapping
const GSTIN_STATE_MAP = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra',
  '28':'Andhra Pradesh','29':'Karnataka','30':'Goa','31':'Lakshadweep',
  '32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman and Nicobar Islands',
  '36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory',
};

// ─────────────────────────────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────────────────────────────
function getSessionConfig() {
  try { return JSON.parse(localStorage.getItem('ledger_config') || '{}'); }
  catch { return {}; }
}

function getRateWiseLedgers() {
  // Shape: { "5": { cgst: "Input CGST 2.5%", sgst: "Input SGST 2.5%", igst: "Input IGST 5%" },
  //          "18": { cgst: "Input CGST 9%",  sgst: "Input SGST 9%",  igst: "Input IGST 18%" } }
  try { return JSON.parse(localStorage.getItem('rate_wise_ledgers') || '{}'); }
  catch { return {}; }
}

// For a given gstRate, find the best matching ledger config
// Falls back to default config if no rate-specific config found
function getLedgersForRate(gstRate, rateWise, defaults) {
  const key = String(gstRate);
  if (rateWise[key]) return rateWise[key];
  // Try partial match e.g. "5.0" → "5"
  const alt = Object.keys(rateWise).find((k) => parseFloat(k) === parseFloat(gstRate));
  if (alt) return rateWise[alt];
  return defaults; // fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Searchable ledger dropdown (for party name)
// ─────────────────────────────────────────────────────────────────────────────
function LedgerSearch({ ledgers, value, onChange, placeholder = 'Search ledger…', suggestions = [] }) {
  const [query,    setQuery]    = useState(value || '');
  const [open,     setOpen]     = useState(false);
  const [focused,  setFocused]  = useState(false);
  const ref = useRef();

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.length >= 1
    ? ledgers.filter((l) => l.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : suggestions.length ? suggestions : ledgers.slice(0, 10);

  const select = (name) => { onChange(name); setQuery(name); setOpen(false); };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 220 }}>
      <input
        className="cell-input"
        style={{ width: '100%', paddingRight: 24 }}
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setFocused(true); }}
        onBlur={() => setFocused(false)}
      />
      {query && (
        <span
          onClick={() => { onChange(''); setQuery(''); setOpen(false); }}
          style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
            cursor:'pointer', color:'var(--text-muted)', fontSize:14 }}>✕</span>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0, zIndex:999,
          background:'var(--bg-primary)', border:'1px solid var(--border)',
          borderRadius:6, boxShadow:'0 4px 16px rgba(0,0,0,0.15)',
          maxHeight:220, overflowY:'auto',
        }}>
          {suggestions.length > 0 && !query && (
            <div style={{ padding:'4px 10px', fontSize:11, color:'var(--text-muted)',
              borderBottom:'1px solid var(--border)', background:'var(--bg-secondary)' }}>
              ⚡ Suggested matches
            </div>
          )}
          {filtered.map((l) => (
            <div key={l}
              onMouseDown={() => select(l)}
              style={{
                padding:'7px 12px', cursor:'pointer', fontSize:13,
                background: l === value ? 'var(--primary-light)' : 'transparent',
                borderBottom:'1px solid var(--border-subtle)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = l === value ? 'var(--primary-light)' : 'transparent'}
            >
              {l}
              {suggestions.includes(l) && !query && (
                <span style={{ marginLeft:6, fontSize:10, color:'var(--primary)', fontWeight:600 }}>MATCH</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ItemMappingGrid({
  invoice,
  tallyCompany,
  onMappingUpdate,
  invoiceType     = 'purchase',
  voucherTypeName = 'Purchase',
}) {
  const stockItems = (tallyCompany?.stock_items || []).map((s) => typeof s === 'string' ? s : s.name);
  const units      = (tallyCompany?.units       || []).map((u) => typeof u === 'string' ? u : u.name);
  const ledgers    = (tallyCompany?.ledgers     || []).map((l) => typeof l === 'string' ? l : l.name);

  const sessionConfig  = getSessionConfig();
  const rateWiseLedgers = getRateWiseLedgers();

  // ── Invoice-level fields (party, place of supply, GST type, GSTIN) ──────────
  // Fuzzy-match supplier name against Tally ledgers on first render
  const einvoiceParty    = invoice.supplier?.name   || invoice.buyer?.name || '';
  const einvoiceGstin    = invoice.supplier?.gstin  || invoice.seller_gstin || '';
  const einvoicePos      = invoice.place_of_supply  || invoice.pos || '';
  // Extract supplier/party state from e-invoice (multiple possible locations)
  const einvoicePartyState = extractPartyState(invoice);
  const einvoiceBuyerGstin = invoice.buyer?.gstin || '';
  const einvoiceBuyerAddress = invoice.buyer?.address || '';

  const suggestedParties = fuzzyMatchLedgers(einvoiceParty, ledgers, 6);

  const [partyLedger,    setPartyLedger]    = useState(suggestedParties[0] || einvoiceParty);
  const [placeOfSupply,  setPlaceOfSupply]  = useState(einvoicePos || '');
  const [isInterstate,   setIsInterstate]   = useState(invoice.is_interstate || false);
  const [gstin,          setGstin]          = useState(einvoiceGstin);
  const [partyState,     setPartyState]     = useState(einvoicePartyState); // → <STATENAME> in XML
  const [showInvoiceInfo, setShowInvoiceInfo] = useState(true); // always visible on open
  const [buyerGstin , setBuyerGstin] = useState(einvoiceBuyerGstin);
  const [buyerAddress , setBuyerAddress] = useState(einvoiceBuyerAddress);
  const [otherCharges, setOtherCharges] = useState(invoice.other_charges || 0);
  // ── Ledger settings ────────────────────────────────────────────
  const [settings, setSettings] = useState({
    igst_ledger:     sessionConfig.igst_ledger     || 'Input IGST',
    purchase_ledger: sessionConfig.purchase_ledger || 'Purchase',
    roundoff_ledger: sessionConfig.roundoff_ledger || 'Round Off', // from Tally
    freight_ledger:  sessionConfig.freight_ledger  || 'Freight Charges',
  });
  const [showSettings, setShowSettings] = useState(false);

  // ── Rate-wise ledger panel state ───────────────────────────────
  const [rateWise, setRateWise]         = useState(() => {
    // Pre-populate from sessionStorage, then auto-detect rates from items
    const saved = getRateWiseLedgers();
    return saved;
  });
  const [showRateWise, setShowRateWise] = useState(false);

  // ── Item rows ──────────────────────────────────────────────────
  const [items, setItems] = useState(() =>
    (invoice.items || []).map((item, idx) => {
      const qty     = parseFloat(item.quantity ?? item.qty   ?? 0);
      const rate    = parseFloat(item.rate     ?? item.price ?? 0);
      const gstRate = parseFloat(item.gst_rate ?? item.gstRate ?? item.tax_rate ?? 0);
      const taxable = parseFloat(item.taxable_amount ?? item.taxable ?? item.assAmt ?? (qty * rate));
      const cgst    = parseFloat(item.cgst ?? 0);
      const sgst    = parseFloat(item.sgst ?? 0);
      const igst    = parseFloat(item.igst ?? 0);
      const total   = parseFloat(item.total ?? item.total_amount ?? (taxable + cgst + sgst + igst));

      return {
        id: idx,
        desc:    item.description ?? item.desc ?? item.name ?? '',
        hsn:     item.hsn ?? item.hsn_code ?? '',
        qty, rate, gstRate,
        uom:     item.unit ?? item.uom ?? (units[0] || 'Nos'),
        altUnit: '',
        taxable, cgst, sgst, igst, total,
        mappedItem: null,
        saved: false,
      };
    })
  );

  // Detect unique GST rates used in this invoice
  const uniqueRates = [...new Set(items.map((i) => i.gstRate).filter(Boolean))].sort((a, b) => a - b);

  // Auto-populate rateWise for rates that don't have a mapping yet
  useEffect(() => {
    setRateWise((prev) => {
      const updated = { ...prev };
      uniqueRates.forEach((r) => {
        if (!updated[String(r)]) {
          updated[String(r)] = {
            cgst: sessionConfig.cgst_ledger || 'Input CGST',
            sgst: sessionConfig.sgst_ledger || 'Input SGST',
            igst: sessionConfig.igst_ledger || 'Input IGST',
          };
        }
      });
      return updated;
    });
  }, [invoice.invoice_no]);

  // ── Multi-select ───────────────────────────────────────────────
  const [selected,    setSelected]    = useState(new Set());
  const [bulkItem,    setBulkItem]    = useState('');
  const [bulkGst,     setBulkGst]     = useState('');
  const [bulkAltUnit, setBulkAltUnit] = useState('');
  const [bulkUnit,    setBulkUnit]    = useState('');   // NEW: bulk primary unit change

  const [suggestions,  setSuggestions]  = useState({});
  const [loadingSugg,  setLoadingSugg]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [xmlResult,    setXmlResult]    = useState(null);
  const [pushResult,   setPushResult]   = useState(null);
  const [xmlError,     setXmlError]     = useState(null);

  // ── Auto-detect interstate from GSTIN ─────────────────────────
  // If buyer's state code (pos) differs from seller's → interstate
  useEffect(() => {
    if (invoice.is_interstate !== undefined) return;
    const sellerStateCode = einvoiceGstin?.substring(0, 2);
    const buyerStateCode  = invoice.buyer?.gstin?.substring(0, 2);
    if (sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode) {
      setIsInterstate(true);
    }
  }, []);

  // ── Fetch suggestions + DB mappings ────────────────────────────
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
        setItems((prev) => prev.map((item) => {
          const s = sugg[item.desc];
          if (s?.suggested_item && s.confidence >= 1.0 && !item.mappedItem)
            return { ...item, mappedItem: s.suggested_item };
          return item;
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingSugg(false));

    mappingApi.getByCompany(tallyCompany.id)
      .then((res) => {
        const dbMap = {};
        (res.data.mappings || []).forEach((m) => { dbMap[m.json_description] = m; });
        setItems((prev) => prev.map((item) => {
          if (!item.mappedItem && dbMap[item.desc])
            return { ...item, mappedItem: dbMap[item.desc].tally_item_name,
              altUnit: dbMap[item.desc].alt_unit || '', saved: true };
          return item;
        }));
      })
      .catch(() => {});
  }, [invoice.invoice_no]);

  // ── Notify parent ──────────────────────────────────────────────
  useEffect(() => {
    const mapped = items.filter((i) => i.mappedItem).length;
    onMappingUpdate(mapped, items.length);
  }, [items]);

  // ── Item update ────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const arr  = [...prev];
      const item = { ...arr[idx], [field]: value };
      if (['qty', 'rate', 'gstRate'].includes(field)) {
        const taxable = item.qty * item.rate;
        const gstAmt  = (taxable * item.gstRate) / 100;
        item.taxable  = taxable;
        item.cgst     = isInterstate ? 0 : gstAmt / 2;
        item.sgst     = isInterstate ? 0 : gstAmt / 2;
        item.igst     = isInterstate ? gstAmt : 0;
        item.total    = taxable + gstAmt;
      }
      arr[idx] = item; return arr;
    });
  };

  // ── Multi-select ───────────────────────────────────────────────
  const toggleSelect  = (idx) => setSelected((p) => { const s = new Set(p); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });
  const toggleAll     = () => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)));

  const applyBulk = () => {
    setItems((prev) => prev.map((item, idx) => {
      if (!selected.has(idx)) return item;
      const u = { ...item };
      if (bulkItem) u.mappedItem = bulkItem;
      if (bulkGst) {
        u.gstRate = parseFloat(bulkGst);
        const tax = u.qty * u.rate;
        const g   = (tax * u.gstRate) / 100;
        u.taxable = tax; u.cgst = g / 2; u.sgst = g / 2; u.total = tax + g;
      }
      if (bulkAltUnit) u.altUnit = bulkAltUnit;
      if (bulkUnit)    u.uom     = bulkUnit;
      return u;
    }));
    setBulkItem(''); setBulkGst(''); setBulkAltUnit(''); setBulkUnit('');
    setSelected(new Set());
  };

  // ── Build payload ──────────────────────────────────────────────
  // Core of the new logic: per-item GST ledgers based on rate-wise config
  const buildPayload = () => {
    const mapped = items.filter((i) => i.mappedItem);

    // Group items by GST rate → compute per-rate GST totals
    const rateGroups = {};
    mapped.forEach((item) => {
      const key = String(item.gstRate);
      if (!rateGroups[key]) rateGroups[key] = { cgst: 0, sgst: 0, igst: 0 };
      rateGroups[key].cgst += item.cgst;
      rateGroups[key].sgst += item.sgst;
      rateGroups[key].igst += item.igst;
    });

    // Build gst_ledger_entries: list of { cgst_ledger, sgst_ledger, igst_ledger,
    //                                     cgst_amount, sgst_amount, igst_amount }
    // One entry per unique GST rate
    const defaultLedgers = {
      cgst: sessionConfig.cgst_ledger || 'Input CGST',
      sgst: sessionConfig.sgst_ledger || 'Input SGST',
      igst: settings.igst_ledger,
    };

    const gst_ledger_entries = Object.entries(rateGroups).map(([rate, amounts]) => {
      const ledCfg = getLedgersForRate(rate, rateWise, defaultLedgers);
      return {
        gst_rate:     parseFloat(rate),
        cgst_ledger:  ledCfg.cgst || defaultLedgers.cgst,
        sgst_ledger:  ledCfg.sgst || defaultLedgers.sgst,
        igst_ledger:  ledCfg.igst || defaultLedgers.igst,
        cgst_amount:  amounts.cgst,
        sgst_amount:  amounts.sgst,
        igst_amount:  amounts.igst,
      };
    });

    return {
      company_name:       tallyCompany.company_name,
      invoice_no:         invoice.invoice_no,
      invoice_date:       invoice.invoice_date,
      supplier_ledger:    partyLedger,         // ← TALLY ledger name, not e-invoice name
      supplier_gstin:     gstin,
      place_of_supply:    placeOfSupply,
      party_state:        partyState,          // → <STATENAME> + <BASICBUYERSSALESTAXSTATE>
      buyer_gstin: buyerGstin,
      buyer_address: buyerAddress,
      voucher_type:       voucherTypeName,
      items: mapped.map((i) => {
        // Tally ke liye unit abbreviation nikal rahe hain (e.g., 'boxes' -> 'b')
        const rawUnit = (i.altUnit || i.uom).toLowerCase().trim();
        const abbr = UNIT_ABBR[rawUnit];
        const finalUnit = (abbr !== undefined && abbr !== '') ? abbr : (i.altUnit || i.uom);

        return {
          stock_item: i.mappedItem,
          quantity:   i.qty,        // ✅ Ab yahan sirf pure number jayega (e.g., 10)
          unit:       finalUnit,    // ✅ Unit alag se jayegi (e.g., 'b')
          rate:       i.rate,
          amount:     i.taxable,
          gst_rate:   i.gstRate,
        };
      }),
      is_interstate:      isInterstate,
      // Legacy flat totals (for single-rate invoices / backward compat)
      cgst_total:         mapped.reduce((s, i) => s + i.cgst, 0),
      sgst_total:         mapped.reduce((s, i) => s + i.sgst, 0),
      igst_total:         isInterstate ? mapped.reduce((s, i) => s + i.igst, 0) : 0,
      // NEW: rate-wise ledger entries (backend will use this if present)
      gst_ledger_entries,
      // Ledgers
      purchase_ledger:    settings.purchase_ledger,
      igst_ledger:        settings.igst_ledger,
      roundoff_ledger:    settings.roundoff_ledger,
      freight_ledger:     settings.freight_ledger,
      other_charges:      parseFloat(otherCharges || 0),
      round_off:          parseFloat(invoice.round_off     || 0),
    };
  };

  // ── Save mappings ──────────────────────────────────────────────
  const handleSave = async () => {
    const toSave = items.filter((i) => i.mappedItem && !i.saved);
    if (!toSave.length) { alert('No new mappings to save'); return; }
    setSaving(true);
    try {
      await Promise.all(toSave.map((item) =>
        mappingApi.save({
          company_id: tallyCompany.id,
          json_description: item.desc,
          tally_item_name:  item.mappedItem,
          alt_unit:         item.altUnit || '',
          last_sales_rate:  item.rate,
        })
      ));
      setItems((prev) => prev.map((i) => i.mappedItem ? { ...i, saved: true } : i));
      alert(`✅ ${toSave.length} mapping(s) saved`);
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  const handleGenerate = async () => {
    if (!items.some((i) => i.mappedItem)) { alert('Map at least one item first'); return; }
    if (!partyLedger) { alert('Select Party/Supplier ledger first'); return; }
    setXmlError(null); setXmlResult(null);
    try { const r = await voucherApi.generate(buildPayload()); setXmlResult(r.data); }
    catch (e) { setXmlError(e.response?.data?.detail || e.message); }
  };

  const handleDownloadXml = async () => {
    if (!items.some((i) => i.mappedItem)) return;
    if (!partyLedger) { alert('Select Party/Supplier ledger first'); return; }
    setXmlError(null);
    try {
      const res = await voucherApi.download(buildPayload());
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/xml' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const slug = partyLedger.replace(/[^a-z0-9]/gi, '_').substring(0, 25);
      a.setAttribute('download', `${voucherTypeName}_${invoice.invoice_no}_${slug}.xml`);
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e.response?.data
        ? (typeof e.response.data === 'string' ? e.response.data : (await e.response.data.text?.() || 'Download failed'))
        : e.message;
      setXmlError('XML download failed: ' + msg);
    }
  };

  const handlePush = async () => {
    if (!items.some((i) => i.mappedItem)) return;
    if (!partyLedger) { alert('Select Party/Supplier ledger first'); return; }
    setPushResult(null);
    try { const r = await voucherApi.generateAndSend(buildPayload()); setPushResult(r.data); }
    catch (e) { alert('Push failed: ' + (e.response?.data?.detail || e.message)); }
  };

  const mappedCount = items.filter((i) => i.mappedItem).length;
  const grandTotal  = items.reduce((s, i) => s + i.total, 0) + parseFloat(otherCharges || 0);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="item-grid-wrap">

      {/* ── TOOLBAR ── */}
      <div className="grid-toolbar">
        <div>
          <strong>{invoice.invoice_no}</strong>
          <span className="muted"> — {einvoiceParty}</span>
          <span style={{ marginLeft:10, fontSize:12, padding:'2px 8px',
            background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:5 }}>
            {invoiceType === 'purchase' ? '🛒' : invoiceType === 'sales' ? '💰' : '📓'}&nbsp;{voucherTypeName}
          </span>
          {loadingSugg && <span className="sugg-loading"> ⚡ loading suggestions…</span>}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowInvoiceInfo(!showInvoiceInfo)}>
            🏢 Party & GST {showInvoiceInfo ? '▲' : '▼'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowRateWise(!showRateWise)}>
            📊 Rate Ledgers {showRateWise ? '▲' : '▼'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSettings(!showSettings)}>
            ⚙️ Ledgers {showSettings ? '▲' : '▼'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleSave} disabled={saving || !mappedCount}>
            {saving ? 'Saving…' : '💾 Save Mappings'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleGenerate} disabled={!mappedCount}>
            📋 Preview XML
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleDownloadXml} disabled={!mappedCount}>
            ⬇️ Download XML
          </button>
          <button className="btn btn-primary btn-sm" onClick={handlePush} disabled={!mappedCount}>
            🚀 Push to Tally
          </button>
        </div>
      </div>

      {/* ── PARTY & GST INFO PANEL ── */}
      {showInvoiceInfo && (
        <div className="settings-panel-inline party-panel" style={{ borderColor: partyLedger ? 'var(--success)' : 'var(--warning)' }}>
          <div className="party-panel-header">
            <span className="party-panel-title">🏢 Party & Invoice Details</span>
            {!partyLedger && (
              <span className="party-required-badge">⚠️ Party ledger required before generating XML</span>
            )}
            {einvoicePartyState && partyState && (
              <span className="party-state-auto-badge">📍 State auto-detected: <strong>{partyState}</strong></span>
            )}
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', paddingRight: '8px', paddingBottom: '10px' }}>    
            <div className="party-grid">

              {/* Party Ledger — full width row */}
              <div className="party-field party-field--wide">
                <label className="form-label">
                  Party / Supplier Ledger <span className="field-source">(select from Tally)</span>
                </label>
                <div className="party-ledger-hint">
                  e-invoice party: <em>"{einvoiceParty}"</em>
                </div>
                <LedgerSearch
                  ledgers={ledgers}
                  value={partyLedger}
                  onChange={setPartyLedger}
                  placeholder={`Search Tally ledger…`}
                  suggestions={suggestedParties}
                />
                {suggestedParties.length > 0 && !partyLedger && (
                  <div className="party-sugg-chips">
                    {suggestedParties.slice(0, 4).map((s) => (
                      <button key={s} className="sugg-chip" onClick={() => setPartyLedger(s)} title="Click to select">
                        ⚡ {s}
                      </button>
                    ))}
                  </div>
                )}
                {partyLedger && (
                  <div className="party-selected-ok">
                    ✅ XML will use: <strong>{partyLedger}</strong>
                  </div>
                )}
              </div>

              {/* GSTIN */}
              <div className="party-field">
                <label className="form-label">
                  Supplier GSTIN <span className="field-source">(from e-invoice)</span>
                </label>
                <input
                  className="form-control"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="22AAAAA0000A1Z5"
                  style={{ fontFamily:'monospace', fontSize:12, letterSpacing:1 }}
                />
              </div>

              {/* Party State — NEW: extracted from e-invoice, goes to <STATENAME> */}
              <div className="party-field">
                <label className="form-label">
                  Party State <span className="field-source">(→ &lt;STATENAME&gt; in XML)</span>
                </label>
                {einvoicePartyState && (
                  <div className="party-auto-extract">
                    Auto-extracted: <strong>{einvoicePartyState}</strong>
                  </div>
                )}
                <select className="form-control" value={partyState}
                  onChange={(e) => setPartyState(e.target.value)}>
                  <option value="">— Select State —</option>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Buyer GSTIN (Editable) */}
              <div className="party-field">
                <label className="form-label">
                  Buyer GSTIN <span className="field-source">(→ &lt;BUYERGSTIN&gt;)</span>
                </label>
                <input
                  className="form-control"
                  value={buyerGstin}
                  onChange={(e) => setBuyerGstin(e.target.value)}
                  placeholder="24AAAAA0000A1Z5"
                  style={{ fontFamily:'monospace', fontSize:12, letterSpacing:1 }}
                />
              </div>

              {/* Buyer Address (Editable) */}
              <div className="party-field party-field--wide">
                <label className="form-label">
                  Buyer Address <span className="field-source">(→ &lt;BASICBUYERADDRESS&gt;)</span>
                </label>
                <input
                  className="form-control"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  placeholder="Enter Buyer Address..."
                />
              </div>

              {/* Place of Supply */}
              <div className="party-field">
                <label className="form-label">
                  Place of Supply <span className="field-source">(→ &lt;PLACEOFSUPPLY&gt;)</span>
                </label>
                <select className="form-control" value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}>
                  <option value="">— Select State —</option>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Freight / Charges Input */}
              <div className="party-field">
                <label className="form-label">
                  Freight / Charges <span className="field-source">(₹)</span>
                </label>
                <input
                  type="number"
                  className="form-control"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              {/* GST Type */}
              <div className="party-field">
                <label className="form-label">GST Type</label>
                <div className="gst-type-toggle">
                  <button
                    className={`gst-toggle-btn ${!isInterstate ? 'active' : ''}`}
                    onClick={() => setIsInterstate(false)}>
                    🏠 Intrastate<br/><span>CGST + SGST</span>
                  </button>
                  <button
                    className={`gst-toggle-btn ${isInterstate ? 'active' : ''}`}
                    onClick={() => setIsInterstate(true)}>
                    🚀 Interstate<br/><span>IGST</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── RATE-WISE GST LEDGER PANEL ── */}
      {showRateWise && (
        <div className="settings-panel-inline" style={{ borderColor:'var(--primary)' }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
            <span style={{ fontWeight:600, fontSize:13 }}>📊 Rate-wise GST Ledgers</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>
              Map each GST rate to its Tally ledger pair — e.g. 5% → CGST @2.5%, 18% → CGST @9%
            </span>
          </div>

          {uniqueRates.length === 0 && (
            <div style={{ fontSize:12, color:'var(--text-muted)', padding:'8px 0' }}>
              No GST rates detected in this invoice's items.
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {uniqueRates.map((rate) => {
              const key = String(rate);
              const cfg = rateWise[key] || { cgst: '', sgst: '', igst: '' };
              const itemsWithRate = items.filter((i) => i.gstRate === rate);
              const cgstAmt = itemsWithRate.reduce((s, i) => s + i.cgst, 0);
              const sgstAmt = itemsWithRate.reduce((s, i) => s + i.sgst, 0);
              const igstAmt = itemsWithRate.reduce((s, i) => s + i.igst, 0);

              return (
                <div key={key} style={{
                  border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px',
                  background:'var(--bg-secondary)',
                }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontWeight:700, fontSize:14, minWidth:60 }}>{rate}% GST</span>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {itemsWithRate.length} item(s) — CGST ₹{cgstAmt.toFixed(2)} | SGST ₹{sgstAmt.toFixed(2)} | IGST ₹{igstAmt.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    {!isInterstate ? (
                      <>
                        <div className="form-group" style={{ marginBottom:0, minWidth:200 }}>
                          <label className="form-label">CGST Ledger for {rate}%</label>
                          <select className="form-control" value={cfg.cgst}
                            onChange={(e) => setRateWise((p) => ({ ...p, [key]: { ...cfg, cgst: e.target.value } }))}>
                            <option value="">— Select —</option>
                            {ledgers.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom:0, minWidth:200 }}>
                          <label className="form-label">SGST Ledger for {rate}%</label>
                          <select className="form-control" value={cfg.sgst}
                            onChange={(e) => setRateWise((p) => ({ ...p, [key]: { ...cfg, sgst: e.target.value } }))}>
                            <option value="">— Select —</option>
                            {ledgers.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                      </>
                    ) : (
                      <div className="form-group" style={{ marginBottom:0, minWidth:200 }}>
                        <label className="form-label">IGST Ledger for {rate}%</label>
                        <select className="form-control" value={cfg.igst}
                          onChange={(e) => setRateWise((p) => ({ ...p, [key]: { ...cfg, igst: e.target.value } }))}>
                          <option value="">— Select —</option>
                          {ledgers.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-outline btn-sm" style={{ marginTop:10 }}
            onClick={() => {
              localStorage.setItem('rate_wise_ledgers', JSON.stringify(rateWise));
              alert('✅ Rate-wise ledger config saved to session');
            }}>
            💾 Save Rate Config to Session
          </button>
        </div>
      )}

      {/* ── LEDGER SETTINGS PANEL ── */}
      {showSettings && (
        <div className="settings-panel-inline">
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>

            {/* IGST ledger (for single-rate or interstate fallback) */}
            <div className="form-group" style={{ marginBottom:0, minWidth:170 }}>
              <label className="form-label">IGST Ledger (fallback)</label>
              <select className="form-control" value={settings.igst_ledger}
                onChange={(e) => setSettings((p) => ({ ...p, igst_ledger: e.target.value }))}>
                <option value={settings.igst_ledger}>{settings.igst_ledger}</option>
                {ledgers.filter((l) => l !== settings.igst_ledger).map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* Purchase ledger */}
            <div className="form-group" style={{ marginBottom:0, minWidth:170 }}>
              <label className="form-label">{invoiceType === 'sales' ? 'Sales Account' : 'Purchase Account'} Ledger</label>
              <select className="form-control" value={settings.purchase_ledger}
                onChange={(e) => setSettings((p) => ({ ...p, purchase_ledger: e.target.value }))}>
                <option value={settings.purchase_ledger}>{settings.purchase_ledger}</option>
                {ledgers.filter((l) => l !== settings.purchase_ledger).map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* Round Off ledger — CRITICAL: from Tally, not hardcoded */}
            <div className="form-group" style={{ marginBottom:0, minWidth:170 }}>
              <label className="form-label">
                Round Off Ledger
                <span style={{ marginLeft:4, fontSize:10, color:'var(--text-muted)' }}>(from Tally)</span>
              </label>
              <select className="form-control" value={settings.roundoff_ledger}
                onChange={(e) => setSettings((p) => ({ ...p, roundoff_ledger: e.target.value }))}>
                <option value={settings.roundoff_ledger}>{settings.roundoff_ledger}</option>
                {ledgers.filter((l) => l !== settings.roundoff_ledger).map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* Freight/Other Charges ledger */}
            <div className="form-group" style={{ marginBottom:0, minWidth:170 }}>
              <label className="form-label">
                Freight / Charges Ledger
                <span style={{ marginLeft:4, fontSize:10, color:'var(--text-muted)' }}>(from Tally)</span>
              </label>
              <select className="form-control" value={settings.freight_ledger}
                onChange={(e) => setSettings((p) => ({ ...p, freight_ledger: e.target.value }))}>
                <option value={settings.freight_ledger}>{settings.freight_ledger}</option>
                {ledgers.filter((l) => l !== settings.freight_ledger).map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

          </div>
        </div>
      )}

      {/* ── BULK ACTIONS BAR ── */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="muted">{selected.size} selected</span>
          <select className="cell-select" value={bulkItem} onChange={(e) => setBulkItem(e.target.value)} style={{ minWidth:180 }}>
            <option value="">— Bulk Map Item —</option>
            {stockItems.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="cell-select" value={bulkGst} onChange={(e) => setBulkGst(e.target.value)} style={{ width:90 }}>
            <option value="">— GST % —</option>
            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
          <select className="cell-select" value={bulkUnit} onChange={(e) => setBulkUnit(e.target.value)} style={{ width:120 }}>
            <option value="">— Unit —</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="cell-select" value={bulkAltUnit} onChange={(e) => setBulkAltUnit(e.target.value)} style={{ width:120 }}>
            <option value="">— Alt Unit —</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={applyBulk} disabled={!bulkItem && !bulkGst && !bulkAltUnit && !bulkUnit}>Apply</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* ── BANNERS ── */}
      {pushResult?.success && <div className="alert alert-success">✅ {pushResult.message}</div>}
      {xmlError             && <div className="alert alert-error">⚠️ {xmlError}</div>}

      {/* ── XML PREVIEW ── */}
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

      {/* ── ITEM TABLE ── */}
      <div className="table-scroll">
        <table className="mapping-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} /></th>
              <th>#</th>
              <th>Description</th>
              <th>HSN</th>
              <th>Qty</th>
              <th>Unit (Tally)</th>
              <th>Alt. Unit</th>
              <th>Rate (₹)</th>
              <th>Taxable</th>
              <th>GST %</th>
              {isInterstate
                ? <th>IGST</th>
                : <><th>CGST</th><th>SGST</th></>
              }
              <th>Total</th>
              <th>Map to Tally Item ↓</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const sugg     = suggestions[item.desc];
              const tallyQty = getTallyQty(item.qty, item.uom, item.altUnit);
              // Show which ledger will be used for this item's rate
              const itemRateKey = String(item.gstRate);
              const ledCfg = rateWise[itemRateKey];
              const ledgerHint = ledCfg
                ? (isInterstate ? ledCfg.igst : `${ledCfg.cgst} / ${ledCfg.sgst}`)
                : null;

              return (
                <tr key={idx} className={item.mappedItem ? (item.saved ? 'row-saved' : 'row-mapped') : 'row-pending'}>
                  <td><input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} /></td>
                  <td className="muted">{idx + 1}</td>
                  <td><span className="desc-cell" title={item.desc}>{item.desc || '—'}</span></td>
                  <td><code style={{ fontSize:11 }}>{item.hsn || '—'}</code></td>

                  <td>
                    <input className="cell-input" type="number" value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                    {item.altUnit && <div className="tally-qty-preview">→ {tallyQty}</div>}
                  </td>

                  <td>
                    <select className="cell-select" value={item.uom} onChange={(e) => updateItem(idx, 'uom', e.target.value)}>
                      {units.length ? units.map((u) => <option key={u} value={u}>{u}</option>) : <option value={item.uom}>{item.uom}</option>}
                    </select>
                  </td>

                  <td>
                    <select className="cell-select" value={item.altUnit} onChange={(e) => updateItem(idx, 'altUnit', e.target.value)}>
                      <option value="">— none —</option>
                      {units.filter((u) => u !== item.uom).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>

                  <td className="num">{item.rate.toFixed(2)}</td>
                  <td className="num">{item.taxable.toFixed(2)}</td>

                  <td>
                    <select className="cell-select" style={{ width:68 }} value={item.gstRate}
                      onChange={(e) => updateItem(idx, 'gstRate', parseFloat(e.target.value))}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                    {ledgerHint && (
                      <div style={{ fontSize:10, color:'var(--primary)', marginTop:2, maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title={ledgerHint}>
                        {ledgerHint}
                      </div>
                    )}
                  </td>

                  {isInterstate
                    ? <td className="num">{item.igst.toFixed(2)}</td>
                    : <><td className="num">{item.cgst.toFixed(2)}</td><td className="num">{item.sgst.toFixed(2)}</td></>
                  }

                  <td className="num total-cell">{item.total.toFixed(2)}</td>

                  <td className="map-cell">
                    <select className="cell-select map-select" value={item.mappedItem || ''}
                      onChange={(e) => updateItem(idx, 'mappedItem', e.target.value || null)}>
                      <option value="">— select —</option>
                      {stockItems.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {sugg?.suggested_item && !item.mappedItem && (
                      <button className="sugg-chip"
                        onClick={() => updateItem(idx, 'mappedItem', sugg.suggested_item)}
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

      {/* ── FOOTER ── */}
      <div className="grid-footer">
        <span>{items.length} items | {mappedCount} mapped | {items.length - mappedCount} pending</span>
        <span className="footer-party-info">
          {!partyLedger && <span className="footer-warn">⚠️ Set party ledger!</span>}
          {partyLedger && <><span className="footer-label">Party:</span> <strong>{partyLedger}</strong></>}
          {partyState  && <><span className="footer-sep">|</span><span className="footer-label">State:</span> <strong>{partyState}</strong></>}
          {placeOfSupply && <><span className="footer-sep">|</span><span className="footer-label">POS:</span> <strong>{placeOfSupply}</strong></>}
          {gstin && <><span className="footer-sep">|</span><code className="footer-gstin">{gstin}</code></>}
        </span>
        <strong>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits:2 })}</strong>
      </div>
    </div>
  );
}