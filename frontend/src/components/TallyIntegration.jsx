// src/components/TallyIntegration.jsx
import React, { useState } from 'react';
import { tally } from '../services/api';
import './TallyIntegration.css'

const TallyIntegration = ({ companies, addCompany }) => {
  const [companyName, setCompanyName] = useState('');
  const [connecting, setConnecting]   = useState(false);
  const [masters, setMasters]         = useState(null);
  const [error, setError]             = useState(null);

  const handleConnect = async () => {
    if (!companyName.trim()) return;
    setConnecting(true);
    setError(null);
    setMasters(null);

    try {
      // POST /api/tally/connect → { company_name, ledgers[], stock_items[], units[] }
      const res  = await tally.connect(companyName.trim());
      const data = res.data;

      setMasters(data);
      addCompany(data); // store in App state — no new API needed
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="tally-page">

      {/* ── Connect Form ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">🔌 Connect to Tally Prime</h3>
        </div>
        <div className="card-body">
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            Make sure Tally Prime is running with Tally.NET enabled on <code>localhost:9000</code>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Company Name *</label>
              <input
                className="form-control"
                placeholder="Exact name as shown in Tally e.g. My Company Ltd"
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

          {error && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>⚠️ {error}</div>
          )}
        </div>
      </div>

      {/* ── Masters Result ── */}
      {masters && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">✅ Connected — {masters.company_name}</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
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
                    {(masters[m.key] || []).slice(0, 30).map((item, i) => (
                      <div key={i} className="master-item">
                        {typeof item === 'string' ? item : item.name}
                      </div>
                    ))}
                    {masters[m.key]?.length > 30 && (
                      <div className="master-item muted">+{masters[m.key].length - 30} more…</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Already connected this session ── */}
      {companies.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Connected This Session</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Connected At</th>
                  <th>Ledgers</th>
                  <th>Stock Items</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.company_name}</strong></td>
                    <td>{new Date(c.connected_at).toLocaleTimeString('en-IN')}</td>
                    <td><span className="badge badge-blue">{c.ledgers?.length ?? 0}</span></td>
                    <td><span className="badge badge-purple">{c.stock_items?.length ?? 0}</span></td>
                    <td><span className="badge badge-green">{c.units?.length ?? 0}</span></td>
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