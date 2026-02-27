// src/components/Settings.jsx
import React, { useState, useEffect } from 'react';
import { tally } from '../services/api';
import './Settings.css';

const Settings = ({ companies = [] }) => {
  // Normalize companies
  const safeCompanies = Array.isArray(companies)
    ? companies
    : (companies?.companies || []);

  const [selectedCompany,  setSelectedCompany]  = useState('');
  const [liveledgers,      setLiveLedgers]      = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [saved,            setSaved]            = useState(false);

  // ── Ledger config ─────────────────────────────────────────────
  const [config, setConfig] = useState({
    cgst_ledger:     'Input CGST',
    sgst_ledger:     'Input SGST',
    igst_ledger:     'Input IGST',
    purchase_ledger: 'Purchase',
  });

  // ── Voucher type config ───────────────────────────────────────
  // Users can define their own Tally voucher type names here.
  // These are stored in sessionStorage so ItemMappingGrid can read them.
  const [voucherTypes, setVoucherTypes] = useState(() => {
    try {
      const saved = sessionStorage.getItem('voucher_types');
      return saved ? JSON.parse(saved) : {
        purchase: ['Purchase'],        // list of purchase voucher type names in their Tally
        sales:    ['Sales'],
        journal:  ['Journal'],
      };
    } catch { return { purchase: ['Purchase'], sales: ['Sales'], journal: ['Journal'] }; }
  });

  const [newVoucherType, setNewVoucherType] = useState({ category: 'purchase', name: '' });

  // Sync on company change
  useEffect(() => {
    if (safeCompanies.length > 0 && !selectedCompany) {
      const firstCo = safeCompanies[0];
      setSelectedCompany(firstCo.company_name);
      const initialLedgers = (firstCo.ledgers || []).map((l) =>
        typeof l === 'string' ? l : l.name
      );
      setLiveLedgers(initialLedgers);
    }
  }, [safeCompanies]);

  const handleCompanyChange = (name) => {
    setSelectedCompany(name);
    const co = safeCompanies.find((c) => c.company_name === name);
    setLiveLedgers((co?.ledgers || []).map((l) => (typeof l === 'string' ? l : l.name)));
  };

  const handleRefetch = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await tally.connect(selectedCompany);
      const newLedgers = (res.data.ledgers || []).map((l) =>
        typeof l === 'string' ? l : l.name
      );
      setLiveLedgers(newLedgers);
    } catch (e) {
      alert('Tally fetch failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  // Save ledger config to sessionStorage (used by ItemMappingGrid)
  const handleSave = () => {
    try {
      sessionStorage.setItem('ledger_config', JSON.stringify({ ...config, selectedCompany }));
      sessionStorage.setItem('voucher_types', JSON.stringify(voucherTypes));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Could not save settings');
    }
  };

  // Add a voucher type to a category
  const addVoucherType = () => {
    const name = newVoucherType.name.trim();
    if (!name) return;
    const cat = newVoucherType.category;
    setVoucherTypes((prev) => ({
      ...prev,
      [cat]: prev[cat].includes(name) ? prev[cat] : [...prev[cat], name],
    }));
    setNewVoucherType((p) => ({ ...p, name: '' }));
  };

  const removeVoucherType = (cat, name) => {
    setVoucherTypes((prev) => ({
      ...prev,
      [cat]: prev[cat].filter((v) => v !== name),
    }));
  };

  const FIELDS = [
    { key: 'cgst_ledger',     label: 'CGST Input Ledger',  desc: 'Intrastate CGST credit ledger'    },
    { key: 'sgst_ledger',     label: 'SGST Input Ledger',  desc: 'Intrastate SGST credit ledger'    },
    { key: 'igst_ledger',     label: 'IGST Input Ledger',  desc: 'Interstate IGST credit ledger'    },
    { key: 'purchase_ledger', label: 'Purchase Account',   desc: 'Default purchase ledger in Tally' },
  ];

  const VOUCHER_CATEGORIES = [
    { key: 'purchase', label: '🛒 Purchase', desc: 'e.g. Purchase, Local Purchase, Import Purchase' },
    { key: 'sales',    label: '💰 Sales',    desc: 'e.g. Sales, Export Sales, Retail Sales'         },
    { key: 'journal',  label: '📓 Journal',  desc: 'e.g. Journal, Contra, Debit Note'               },
  ];

  if (safeCompanies.length === 0) {
    return (
      <div className="settings-page">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>⚠️ No companies connected.</p>
            <p className="text-muted">
              Please go to <b>Tally Connect</b> to link your Tally company first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">

      {/* ── Company selector ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">🔌 Tally Connection</h3>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Active Company</label>
              <select
                className="form-control"
                value={selectedCompany}
                onChange={(e) => handleCompanyChange(e.target.value)}
              >
                {safeCompanies.map((c) => (
                  <option key={c.id} value={c.company_name}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-outline"
              onClick={handleRefetch}
              disabled={!selectedCompany || loading}
            >
              {loading ? 'Loading…' : '↺ Reload Ledgers'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tax Ledger Mapping ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">📒 Tax Ledger Mapping</h3>
        </div>
        <div className="card-body">
          {FIELDS.map((f) => (
            <div key={f.key} className="settings-row">
              <div>
                <div className="settings-label">{f.label}</div>
                <div className="settings-desc">{f.desc}</div>
              </div>
              <div style={{ width: 260 }}>
                <select
                  className="form-control"
                  value={config[f.key]}
                  onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                >
                  <option value={config[f.key]}>{config[f.key]}</option>
                  {liveledgers
                    .filter((l) => l !== config[f.key])
                    .map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Voucher Types ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">🏷️ Voucher Types</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Add the exact voucher type names from your Tally. These appear as options when generating XML.
          </p>

          {VOUCHER_CATEGORIES.map((cat) => (
            <div key={cat.key} style={{ marginBottom: 20 }}>
              <div className="settings-label" style={{ marginBottom: 6 }}>{cat.label}</div>
              <div className="settings-desc" style={{ marginBottom: 8 }}>{cat.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {voucherTypes[cat.key].map((vt) => (
                  <span
                    key={vt}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '3px 10px', fontSize: 13,
                    }}
                  >
                    {vt}
                    {voucherTypes[cat.key].length > 1 && (
                      <button
                        onClick={() => removeVoucherType(cat.key, vt)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0,
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Add new voucher type */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Category</label>
              <select
                className="form-control"
                style={{ width: 140 }}
                value={newVoucherType.category}
                onChange={(e) => setNewVoucherType((p) => ({ ...p, category: e.target.value }))}
              >
                {VOUCHER_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Voucher Type Name (exact as in Tally)</label>
              <input
                className="form-control"
                placeholder="e.g. Local Purchase"
                value={newVoucherType.name}
                onChange={(e) => setNewVoucherType((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addVoucherType()}
              />
            </div>
            <button className="btn btn-outline" onClick={addVoucherType} disabled={!newVoucherType.name.trim()}>
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* ── Save ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span style={{ color: 'var(--success)' }}>✅ Settings Saved</span>}
      </div>

    </div>
  );
};

export default Settings;