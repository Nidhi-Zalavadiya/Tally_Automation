// src/components/TallyIntegration.jsx
import './TallyIntegration.css';
import React, { useState } from 'react';
import { companies as companiesApi } from '../services/api';
import { useAppState } from '../context/AppstateContext';

const TallyIntegration = ({ setActiveMenu, onSuccess }) => {
  const { companies, addOrUpdateCompany } = useAppState();
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
      const res  = await companiesApi.connect(companyName.trim());
      const data = res.data;
      setMasters(data);
      addOrUpdateCompany(data);
      if (onSuccess) await onSuccess();
      setCompanyName('');
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setConnecting(false);
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
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={connecting || !companyName.trim()}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      {/* Success — show masters after connect */}
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
                      <div className="master-item muted">
                        +{masters[m.key].length - 40} more…
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All companies — status only, no disconnect */}
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
                  <th>Company</th>
                  <th>Last Connected</th>
                  <th>Ledgers</th>
                  <th>Stock</th>
                  <th>Units</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  // Active = has ledgers loaded in this session
                  const isActive = c.ledgers?.length > 0;
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.company_name}</strong></td>
                      <td>
                        {c.connected_at
                          ? new Date(c.connected_at).toLocaleDateString('en-IN')
                          : '—'}
                      </td>
                      <td><span className="badge badge-blue">{c.ledgers?.length ?? '—'}</span></td>
                      <td><span className="badge badge-purple">{c.stock_items?.length ?? '—'}</span></td>
                      <td><span className="badge badge-green">{c.units?.length ?? '—'}</span></td>
                      <td>
                        {isActive
                          ? <span className="badge badge-green">● Active</span>
                          : <span className="badge badge-gray">○ Inactive</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TallyIntegration;