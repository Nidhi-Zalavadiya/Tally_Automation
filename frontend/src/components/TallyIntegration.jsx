// src/components/TallyIntegration.jsx
import './TallyIntegration.css';
import React, { useState } from 'react';
import { companies as companiesApi } from '../services/api';
import { useAppState } from '../context/AppStateContext';

// Added onSuccess prop to trigger refresh in App.jsx
const TallyIntegration = ({ setActiveMenu, onSuccess }) => {
  const { companies, addOrUpdateCompany, removeCompany } = useAppState();
  const [companyName, setCompanyName] = useState('');
  const [connecting,  setConnecting]  = useState(false);
  const [masters,     setMasters]     = useState(null);
  const [error,       setError]       = useState(null);

  const handleConnect = async () => {
    if (!companyName.trim()) return;
    setConnecting(true);
    setError(null);
    setMasters(null);
    try {
      // POST /api/companies/connect — saves to DB + returns masters
      const res  = await companiesApi.connect(companyName.trim());
      const data = res.data;
      
      setMasters(data);
      addOrUpdateCompany(data); 
      
      // ─── KEY CHANGE: Trigger the refresh in App.jsx ───
      if (onSuccess) await onSuccess(); 
      
      setCompanyName('');
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id, name) => {
    if (!window.confirm(`Disconnect "${name}"?`)) return;
    try {
      await companiesApi.disconnect(id);
      removeCompany(id);
      // Refresh the main list after removal
      if (onSuccess) await onSuccess(); 
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <div className="tally-page">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🔌 Connect to Tally Prime</h3>
        </div>
        <div className="card-body">
          <div className="alert alert-info">
            Make sure Tally Prime is open with Tally.NET enabled on <code>localhost:9000</code>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Company Name</label>
              <input
                className="form-control"
                placeholder="Exact name as shown in Tally"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !connecting && handleConnect()}
                disabled={connecting}
              />
            </div>
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting || !companyName.trim()}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      {masters && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">✅ Connected — {masters.company_name}</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveMenu('invoices')}>
              Upload Invoice →
            </button>
          </div>
          <div className="card-body">
            <div className="masters-grid">
              {[
                { key: 'ledgers',     label: 'Ledgers',     icon: '📒' },
                { key: 'stock_items', label: 'Stock Items', icon: '📦' },
                { key: 'units',       label: 'Units',       icon: '📐' },
              ].map((m) => (
                <div key={m.key} className="master-panel">
                  <div className="master-panel-header">
                    <span>{m.icon} {m.label}</span>
                    <span className="badge badge-blue">{masters[m.key]?.length || 0}</span>
                  </div>
                  <div className="master-list">
                    {(masters[m.key] || []).slice(0, 40).map((item, i) => (
                      <div key={i} className="master-item">
                        {typeof item === 'string' ? item : item.name}
                      </div>
                    ))}
                    {masters[m.key]?.length > 40 && (
                      <div className="master-item muted">+{masters[m.key].length - 40} more…</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">All Connected Companies</h3>
            <span className="badge badge-blue">{companies.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th><th>Connected</th><th>Ledgers</th><th>Stock</th><th>Units</th><th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.company_name}</strong></td>
                    <td>{c.connected_at ? new Date(c.connected_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td><span className="badge badge-blue">{c.ledgers?.length ?? '—'}</span></td>
                    <td><span className="badge badge-purple">{c.stock_items?.length ?? '—'}</span></td>
                    <td><span className="badge badge-green">{c.units?.length ?? '—'}</span></td>
                    <td>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDisconnect(c.id, c.company_name)}>
                        Disconnect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TallyIntegration;