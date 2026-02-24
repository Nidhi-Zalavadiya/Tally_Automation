// src/components/Settings.jsx
import React, { useState } from 'react';
import { tally } from '../services/api';
import './Settings.css'

const Settings = ({ companies }) => {
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.company_name || '');
  const [config, setConfig] = useState({
    cgst_ledger:     'Input CGST',
    sgst_ledger:     'Input SGST',
    igst_ledger:     'Input IGST',
    purchase_ledger: 'Purchase',
  });
  const [liveledgers, setLiveLedgers] = useState(
    // use masters already fetched this session if available
    (companies[0]?.ledgers || []).map((l) => (typeof l === 'string' ? l : l.name))
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState(false);

  const handleCompanyChange = (name) => {
    setSelectedCompany(name);
    const co = companies.find((c) => c.company_name === name);
    if (co?.ledgers?.length) {
      setLiveLedgers(co.ledgers.map((l) => (typeof l === 'string' ? l : l.name)));
    }
  };

  // Re-fetch from Tally if needed
  const handleRefetch = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await tally.connect(selectedCompany);
      setLiveLedgers((res.data.ledgers || []).map((l) => (typeof l === 'string' ? l : l.name)));
    } catch (e) {
      alert('Tally fetch failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    // In a real app you'd POST to /api/settings — for now just local state
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const FIELDS = [
    { key: 'cgst_ledger',     label: 'CGST Input Ledger',  desc: 'Intrastate CGST credit ledger'    },
    { key: 'sgst_ledger',     label: 'SGST Input Ledger',  desc: 'Intrastate SGST credit ledger'    },
    { key: 'igst_ledger',     label: 'IGST Input Ledger',  desc: 'Interstate IGST credit ledger'    },
    { key: 'purchase_ledger', label: 'Purchase Account',   desc: 'Default purchase ledger in Tally' },
  ];

  return (
    <div className="settings-page">
      {/* ── Tally Company ── */}
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
                <option value="">— select —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.company_name}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-outline" onClick={handleRefetch} disabled={!selectedCompany || loading}>
              {loading ? 'Loading…' : '↺ Reload Ledgers'}
            </button>
          </div>
          {liveledgers.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              {liveledgers.length} ledgers loaded from Tally
            </p>
          )}
        </div>
      </div>

      {/* ── Tax Ledger Mapping ── */}
      <div className="card">
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
                  {/* current value always present */}
                  <option value={config[f.key]}>{config[f.key]}</option>
                  {liveledgers
                    .filter((l) => l !== config[f.key])
                    .map((l) => <option key={l} value={l}>{l}</option>)
                  }
                </select>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSave}>
              Save Settings
            </button>
            {saved && <span style={{ alignSelf: 'center', color: 'var(--success)', fontSize: 13 }}>✅ Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;