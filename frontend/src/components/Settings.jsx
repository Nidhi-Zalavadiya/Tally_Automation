// src/components/Settings.jsx
import React, { useState, useEffect } from 'react';
import { tally, settings as settingsApi } from '../services/api';
import './Settings.css';

// ── Default Fallbacks ─────────────────────────────────────────
const DEFAULT_LEDGER_CONFIG = {
  cgst_ledger:      'Input CGST',
  sgst_ledger:      'Input SGST',
  igst_ledger:      'Input IGST',
  purchase_ledger:  'Purchase',
  roundoff_ledger:  'Round Off',
  freight_ledger:   'Freight Charges',
};

const DEFAULT_VOUCHER_TYPES = {
  purchase: ['Purchase'],
  sales:    ['Sales'],
  journal:  ['Journal'],
};

// ── GST rates & Indian states ─────────────────────────────────
const GST_SLAB_RATES = [0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];
const INDIAN_STATES = [
  'Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar',
  'Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand',
  'Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra',
  'Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal',
];

const Settings = ({ companies = [] }) => {
  const safeCompanies = Array.isArray(companies) ? companies : (companies?.companies || []);

  const [selectedCompany, setSelectedCompany] = useState('');
  const [liveledgers,     setLiveLedgers]     = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [activeTab,       setActiveTab]       = useState('ledgers');
  
  // NEW: Track if the current settings are actually saved in the DB
  const [isSavedInDb,     setIsSavedInDb]     = useState(false);

  const activeCompanyObj = safeCompanies.find((c) => c.company_name === selectedCompany);
  const activeCompanyId = activeCompanyObj?.id;

  // ── States ────────────────────────────────────────────────────
  const [config, setConfig]             = useState(DEFAULT_LEDGER_CONFIG);
  const [rateWise, setRateWise]         = useState({});
  const [activeRates, setActiveRates]   = useState([]);
  const [voucherTypes, setVoucherTypes] = useState(DEFAULT_VOUCHER_TYPES);
  const [newVoucherType, setNewVoucherType] = useState({ category: 'purchase', name: '' });

  // ── 1. Init Company on First Load ─────────────────────────────
  useEffect(() => {
    if (safeCompanies.length > 0 && !selectedCompany) {
      const firstCo = safeCompanies[0];
      setSelectedCompany(firstCo.company_name);
      setLiveLedgers((firstCo.ledgers || []).map((l) => typeof l === 'string' ? l : l.name));
    }
  }, [safeCompanies, selectedCompany]);

  // ── 2. Load Settings from DB when Company Changes ─────────────
  useEffect(() => {
    if (!activeCompanyId) return;

    const fetchCompanySettings = async () => {
      setLoading(true);
      try {
        const res = await settingsApi.load(activeCompanyId);
        
        if (res.data?.ok) {
          const dbConfig = res.data.ledger_config;
          const dbRateWise = res.data.rate_wise_ledgers;
          const dbVouchers = res.data.voucher_types;

          // Check if DB actually returned populated data
          const hasSavedData = dbConfig && Object.keys(dbConfig).length > 0;
          setIsSavedInDb(hasSavedData);

          // If data exists, use it. If empty, strictly reset to defaults!
          if (hasSavedData) {
            setConfig(dbConfig);
          } else {
            setConfig(DEFAULT_LEDGER_CONFIG);
          }
          
          if (dbRateWise && Object.keys(dbRateWise).length > 0) {
            setRateWise(dbRateWise);
            setActiveRates(Object.keys(dbRateWise).map(Number));
          } else {
            setRateWise({});
            setActiveRates([]);
          }

          if (dbVouchers && Object.keys(dbVouchers).length > 0) {
            setVoucherTypes(dbVouchers);
          } else {
            setVoucherTypes(DEFAULT_VOUCHER_TYPES);
          }
        }
      } catch (e) {
        console.warn('Failed to load settings from DB:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanySettings();
  }, [activeCompanyId]);

  // ── Company sync handlers ─────────────────────────────────────
  const handleCompanyChange = (name) => {
    setSelectedCompany(name);
    const co = safeCompanies.find((c) => c.company_name === name);
    setLiveLedgers((co?.ledgers || []).map((l) => typeof l === 'string' ? l : l.name));
  };

  const handleRefetch = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await tally.connect(selectedCompany);
      setLiveLedgers((res.data.ledgers || []).map((l) => typeof l === 'string' ? l : l.name));
    } catch (e) {
      alert('Tally fetch failed: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // ── Save to DB ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeCompanyId) {
      alert("Please select a company first.");
      return;
    }

    setLoading(true);
    try {
      const rateWiseToSave = {};
      activeRates.forEach((r) => {
        rateWiseToSave[String(r)] = rateWise[String(r)] || {
          cgst: config.cgst_ledger, sgst: config.sgst_ledger, igst: config.igst_ledger,
        };
      });
      const ledgerCfg = { ...config, selectedCompany };
      
      // Save to localStorage for immediate grid access
      localStorage.setItem('ledger_config',     JSON.stringify(ledgerCfg));
      localStorage.setItem('voucher_types',     JSON.stringify(voucherTypes));
      localStorage.setItem('rate_wise_ledgers', JSON.stringify(rateWiseToSave));
      
      // Save to DB
      await settingsApi.save(activeCompanyId, {
        ledger_config:     ledgerCfg,
        rate_wise_ledgers: rateWiseToSave,
        voucher_types:     voucherTypes,
      });
      
      setIsSavedInDb(true); // Update UI to show it's now saved!
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      // FIX: Show an actual error alert if it fails, instead of faking success
      console.error('Settings DB save failed:', e);
      alert('Failed to save settings! Error: ' + (e.response?.data?.detail || e.message));
    } finally { 
      setLoading(false); 
    }
  };

  // ── Helpers ───────────────────────────────────────────────────
  const toggleRate = (rate) => {
    setActiveRates((prev) =>
      prev.includes(rate) ? prev.filter((r) => r !== rate) : [...prev, rate].sort((a, b) => a - b)
    );
    if (!rateWise[String(rate)]) {
      setRateWise((prev) => ({
        ...prev,
        [String(rate)]: { cgst: config.cgst_ledger, sgst: config.sgst_ledger, igst: config.igst_ledger },
      }));
    }
  };

  const updateRateWise = (rate, field, value) => {
    setRateWise((prev) => ({
      ...prev, [String(rate)]: { ...(prev[String(rate)] || {}), [field]: value },
    }));
  };

  const addVoucherType = () => {
    const name = newVoucherType.name.trim();
    if (!name) return;
    const cat = newVoucherType.category;
    setVoucherTypes((prev) => ({
      ...prev, [cat]: prev[cat].includes(name) ? prev[cat] : [...prev[cat], name],
    }));
    setNewVoucherType((p) => ({ ...p, name: '' }));
  };

  const removeVoucherType = (cat, name) => {
    setVoucherTypes((prev) => ({ ...prev, [cat]: prev[cat].filter((v) => v !== name) }));
  };

  // ── Field definitions ─────────────────────────────────────────
  const CORE_FIELDS = [
    { key: 'cgst_ledger',     label: 'CGST Input Ledger',     desc: 'Intrastate CGST credit ledger',          icon: '🔵', color: 'blue'  },
    { key: 'sgst_ledger',     label: 'SGST Input Ledger',     desc: 'Intrastate SGST credit ledger',          icon: '🟢', color: 'green' },
    { key: 'igst_ledger',     label: 'IGST Input Ledger',     desc: 'Interstate IGST credit ledger',          icon: '🟠', color: 'amber' },
    { key: 'purchase_ledger', label: 'Purchase Account',      desc: 'Default purchase ledger in Tally',       icon: '🛒', color: 'purple'},
    { key: 'roundoff_ledger', label: 'Round Off Ledger',      desc: 'Must match exact ledger name in Tally',  icon: '🔄', color: 'cyan'  },
    { key: 'freight_ledger',  label: 'Freight / Charges',     desc: 'Other charges ledger name in Tally',     icon: '🚛', color: 'rose'  },
  ];

  const VOUCHER_CATEGORIES = [
    { key: 'purchase', label: '🛒 Purchase', desc: 'e.g. Purchase, Local Purchase, Import Purchase', color: 'blue'  },
    { key: 'sales',    label: '💰 Sales',    desc: 'e.g. Sales, Export Sales, Retail Sales',         color: 'green' },
    { key: 'journal',  label: '📓 Journal',  desc: 'e.g. Journal, Contra, Debit Note',               color: 'amber' },
  ];

  if (safeCompanies.length === 0) {
    return (
      <div className="settings-page">
        <div className="settings-empty-state">
          <div className="empty-icon">⚙️</div>
          <h3>No Companies Connected</h3>
          <p>Go to <b>Tally Connect</b> to link your Tally company first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">

      <div className="settings-header">
        <div>
          <h2 className="settings-title">⚙️ Settings</h2>
          <p className="settings-subtitle">Configure Tally ledgers, GST mappings and voucher types</p>
        </div>
        <div className="settings-save-bar">
          <button className="btn btn-primary btn-save" onClick={handleSave} disabled={loading}>
            {loading ? <><span className="spinner" />Saving…</> : '💾 Save All Settings'}
          </button>
          {saved && <span className="save-success">✅ Saved!</span>}
        </div>
      </div>

      <div className="scard">
        <div className="scard-header">
          <span className="scard-icon">🔌</span>
          <div>
            <h3 className="scard-title">Tally Connection</h3>
            <p className="scard-desc">Select active company to load its ledgers</p>
          </div>
        </div>
        <div className="scard-body">
          <div className="company-row">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Active Company</label>
              <select className="form-control" value={selectedCompany}
                onChange={(e) => handleCompanyChange(e.target.value)}>
                {safeCompanies.map((c) => (
                  <option key={c.id} value={c.company_name}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-outline reload-btn" onClick={handleRefetch}
              disabled={!selectedCompany || loading}>
              {loading ? <><span className="spinner-sm" />Loading…</> : '↺ Reload Ledgers'}
            </button>
          </div>
          
          {/* NEW: Warning banner if DB has no data */}
          {!loading && !isSavedInDb && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
              ⚠️ <strong>Unsaved Defaults:</strong> No settings are saved for this company yet. Modify the default values below and click <b>Save All Settings</b>.
            </div>
          )}
        </div>
      </div>

      <div className="settings-tabs">
        {[
          { id: 'ledgers',   label: '📒 Tax Ledgers'   },
          { id: 'ratewise',  label: '📊 Rate-wise GST' },
          { id: 'vouchers',  label: '🏷️ Voucher Types' },
        ].map((tab) => (
          <button key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Ledgers */}
      {activeTab === 'ledgers' && (
        <div className="scard">
          <div className="scard-header">
            <span className="scard-icon">📒</span>
            <div>
              <h3 className="scard-title">Tax Ledger Mapping</h3>
              <p className="scard-desc">Default ledgers used across all invoices</p>
            </div>
          </div>
          <div className="scard-body" style={{ padding: 0 }}>
            {CORE_FIELDS.map((f, i) => (
              <div key={f.key} className={`ledger-row ${i === CORE_FIELDS.length - 1 ? 'last' : ''}`}>
                <div className="ledger-row-left">
                  <span className={`ledger-icon ledger-icon--${f.color}`}>{f.icon}</span>
                  <div>
                    <div className="ledger-label">{f.label}</div>
                    <div className="ledger-desc">{f.desc}</div>
                  </div>
                </div>
                <div className="ledger-row-right">
                  <select className="form-control ledger-select"
                    value={config[f.key] || ''}
                    onChange={(e) => {
                      setConfig((p) => ({ ...p, [f.key]: e.target.value }));
                      setIsSavedInDb(false); // Mark as unsaved if they change it
                    }}>
                    {config[f.key] && <option value={config[f.key]}>{config[f.key]}</option>}
                    {liveledgers.filter((l) => l !== config[f.key]).map((l) =>
                      <option key={l} value={l}>{l}</option>
                    )}
                    {liveledgers.length === 0 && !config[f.key] &&
                      <option value="">— Load ledgers first —</option>
                    }
                  </select>
                  
                  {/* UPDATE: Checkmark only shows green if actually saved in DB */}
                  {config[f.key] && (
                    <span 
                      className="ledger-saved-badge" 
                      style={{ 
                        color: isSavedInDb ? 'var(--success)' : '#f59e0b',
                        background: isSavedInDb ? '#dcfce7' : '#fef3c7' 
                      }}
                      title={isSavedInDb ? "Saved" : "Unsaved Edit"}
                    >
                      {isSavedInDb ? '✓' : '●'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Rate-wise */}
      {activeTab === 'ratewise' && (
        <div className="scard">
          <div className="scard-header">
            <span className="scard-icon">📊</span>
            <div>
              <h3 className="scard-title">Rate-wise GST Ledgers</h3>
              <p className="scard-desc">Map each GST slab to its specific Tally input ledger.</p>
            </div>
          </div>
          <div className="scard-body">
            <div className="rate-selector">
              <div className="rate-selector-label">Select GST rates used in your invoices:</div>
              <div className="rate-chips">
                {GST_SLAB_RATES.map((rate) => (
                  <button key={rate}
                    className={`rate-chip ${activeRates.includes(rate) ? 'active' : ''}`}
                    onClick={() => { toggleRate(rate); setIsSavedInDb(false); }}>
                    {rate}%
                    {activeRates.includes(rate) && <span className="rate-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {activeRates.length === 0 && (
              <div className="rate-empty">
                <p>Click the rate chips above to add GST slabs you use.</p>
              </div>
            )}

            <div className="rate-ledger-list">
              {activeRates.map((rate) => {
                const rw = rateWise[String(rate)] || { cgst: '', sgst: '', igst: '' };
                const halfRate = rate / 2;
                return (
                  <div key={rate} className="rate-ledger-card">
                    <div className="rate-ledger-card-header">
                      <span className="rate-badge">{rate}% GST</span>
                      <span className="rate-split">CGST {halfRate}% + SGST {halfRate}% | IGST {rate}%</span>
                      <button className="rate-remove-btn" onClick={() => { toggleRate(rate); setIsSavedInDb(false); }}>✕</button>
                    </div>
                    <div className="rate-ledger-card-body">
                      {/* CGST */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label"><span className="dot dot-blue" />CGST Ledger</label>
                        <select className="form-control" value={rw.cgst || ''}
                          onChange={(e) => { updateRateWise(rate, 'cgst', e.target.value); setIsSavedInDb(false); }}>
                          {rw.cgst && <option value={rw.cgst}>{rw.cgst}</option>}
                          {liveledgers.filter((l) => l !== rw.cgst).map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      {/* SGST */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label"><span className="dot dot-green" />SGST Ledger</label>
                        <select className="form-control" value={rw.sgst || ''}
                          onChange={(e) => { updateRateWise(rate, 'sgst', e.target.value); setIsSavedInDb(false); }}>
                          {rw.sgst && <option value={rw.sgst}>{rw.sgst}</option>}
                          {liveledgers.filter((l) => l !== rw.sgst).map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      {/* IGST */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label"><span className="dot dot-amber" />IGST Ledger</label>
                        <select className="form-control" value={rw.igst || ''}
                          onChange={(e) => { updateRateWise(rate, 'igst', e.target.value); setIsSavedInDb(false); }}>
                          {rw.igst && <option value={rw.igst}>{rw.igst}</option>}
                          {liveledgers.filter((l) => l !== rw.igst).map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Voucher Types */}
      {activeTab === 'vouchers' && (
        <div className="scard">
          <div className="scard-header">
            <span className="scard-icon">🏷️</span>
            <div>
              <h3 className="scard-title">Voucher Types</h3>
              <p className="scard-desc">Add the exact voucher type names from your Tally company</p>
            </div>
          </div>
          <div className="scard-body">
            <div className="voucher-categories">
              {VOUCHER_CATEGORIES.map((cat) => (
                <div key={cat.key} className={`voucher-cat-card voucher-cat--${cat.color}`}>
                  <div className="voucher-cat-header">
                    <span className="voucher-cat-title">{cat.label}</span>
                  </div>
                  <div className="voucher-tags">
                    {voucherTypes[cat.key].map((vt) => (
                      <span key={vt} className="voucher-tag">
                        {vt}
                        {voucherTypes[cat.key].length > 1 && (
                          <button className="voucher-tag-remove"
                            onClick={() => { removeVoucherType(cat.key, vt); setIsSavedInDb(false); }}>×</button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="voucher-add-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Category</label>
                <select className="form-control" style={{ width: 150 }}
                  value={newVoucherType.category}
                  onChange={(e) => setNewVoucherType((p) => ({ ...p, category: e.target.value }))}>
                  {VOUCHER_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Voucher Type Name (exact as in Tally)</label>
                <input className="form-control"
                  placeholder="e.g. Local Purchase, Import Purchase…"
                  value={newVoucherType.name}
                  onChange={(e) => setNewVoucherType((p) => ({ ...p, name: e.target.value }))}
                  onKeyDown={(e) => { if(e.key === 'Enter') { addVoucherType(); setIsSavedInDb(false); } }} />
              </div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }}
                onClick={() => { addVoucherType(); setIsSavedInDb(false); }} disabled={!newVoucherType.name.trim()}>
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="settings-bottom-bar">
        <div className="settings-bottom-info">
          <span>💡 Settings are saved to your database and restored when you log back in.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary btn-save" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : '💾 Save All Settings'}
          </button>
          {saved && <span className="save-success">✅ Saved!</span>}
        </div>
      </div>
    </div>
  );
};

export default Settings;