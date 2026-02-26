import React, { useState, useEffect } from 'react';
import api,{ tally } from '../services/api' // Ensure 'api' is imported for saving
import './Settings.css';

const Settings = ({ companies = [] }) => {
  // 1. NORMALIZE DATA (Same logic as your working Companies.jsx)
  const safeCompanies = Array.isArray(companies) 
    ? companies 
    : (companies && typeof companies === 'object' && Array.isArray(companies.companies))
      ? companies.companies 
      : [];

  const [selectedCompany, setSelectedCompany] = useState('');
  const [config, setConfig] = useState({
    cgst_ledger:     'Input CGST',
    sgst_ledger:     'Input SGST',
    igst_ledger:     'Input IGST',
    purchase_ledger: 'Purchase',
  });
  const [liveledgers, setLiveLedgers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState(false);

  // 2. SYNC STATE (Use safeCompanies)
  useEffect(() => {
    if (safeCompanies.length > 0 && !selectedCompany) {
      const firstCo = safeCompanies[0];
      setSelectedCompany(firstCo.company_name);
      const initialLedgers = (firstCo.ledgers || []).map(l => 
        typeof l === 'string' ? l : l.name
      );
      setLiveLedgers(initialLedgers);
    }
  }, [safeCompanies, selectedCompany]);

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
      const newLedgers = (res.data.ledgers || []).map((l) => (typeof l === 'string' ? l : l.name));
      setLiveLedgers(newLedgers);
    } catch (e) {
      alert('Tally fetch failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  // 3. FIX THE 422 ERROR: Actually send data to the backend
  const handleSave = async () => {
    try {
      setLoading(true);
      const activeCompany = safeCompanies.find(c => c.company_name === selectedCompany);
      
      const payload = {
        company_id: activeCompany?.id,
        company_name: selectedCompany,
        ...config
      };

      // Replace this URL with your actual mapping save endpoint
      await api.post('/api/mappings/save', payload); 
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      // Improved error logging to catch why the 422 is happening
      console.error("Save Error Detail:", e.response?.data);
      alert('Save failed: ' + (e.response?.data?.detail?.[0]?.msg || 'Check console for validation errors'));
    } finally {
      setLoading(false);
    }
  };

  const FIELDS = [
    { key: 'cgst_ledger',     label: 'CGST Input Ledger',  desc: 'Intrastate CGST credit ledger'    },
    { key: 'sgst_ledger',     label: 'SGST Input Ledger',  desc: 'Intrastate SGST credit ledger'    },
    { key: 'igst_ledger',     label: 'IGST Input Ledger',  desc: 'Interstate IGST credit ledger'    },
    { key: 'purchase_ledger', label: 'Purchase Account',   desc: 'Default purchase ledger in Tally' },
  ];

  // 4. GUARD CLAUSE (Use safeCompanies)
  if (safeCompanies.length === 0) {
    return (
      <div className="settings-page">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>⚠️ No companies connected.</p>
            <p className="text-muted">Please go to <b>Tally Connect</b> to link your Tally company first.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* ... (Keep your existing return JSX exactly as it was) ... */}
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
            <button className="btn btn-outline" onClick={handleRefetch} disabled={!selectedCompany || loading}>
              {loading ? 'Loading…' : '↺ Reload Ledgers'}
            </button>
          </div>
        </div>
      </div>

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
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save Settings'}
            </button>
            {saved && <span style={{ color: 'var(--success)' }}>✅ Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;