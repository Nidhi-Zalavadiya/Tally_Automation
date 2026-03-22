// src/components/TallyIntegration.jsx
import './TallyIntegration.css';
import React, { useState } from 'react';
import { companies as companiesApi } from '../services/api';
import { useAppState } from '../context/AppstateContext';

const TallyIntegration = ({ setActiveMenu, onSuccess }) => {
  const { companies, addOrUpdateCompany, activeCompanyId, setActiveCompanyId } = useAppState();
  const [companyName, setCompanyName] = useState('');
  const [connecting,  setConnecting]  = useState(false);
  const [masters,     setMasters]     = useState(null);
  const [error,       setError]       = useState(null);
  
  // 🟢 NEW: State for our custom popup
  const [connectWarning, setConnectWarning] = useState(null);

  const handleConnect = async () => {
    if (!companyName.trim()) return;
    setConnecting(true);
    setError(null);
    setMasters(null);
    try {
      const res  = await companiesApi.connect(companyName.trim());
      const data = res.data;

      // 🟢 Trigger custom popup instead of ugly alert
      if (!data.ledgers || data.ledgers.length === 0) {
        setConnectWarning(`Company "${data.company_name || companyName.trim()}" is NOT OPEN in Tally!\n\nPlease open this exact company in Tally Prime, then click Connect again to fetch your ledgers.`);
        return;
      }
      
      setMasters(data);
      addOrUpdateCompany(data);
      setActiveCompanyId(data.id);
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
      
      {/* 🟢 NEW: Custom In-App Modal Popup */}
      {connectWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }} onClick={() => setConnectWarning(null)}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)', padding: '30px 32px',
            borderRadius: '12px', maxWidth: '400px', width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', 
            textAlign: 'center', border: '1px solid var(--border)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#b91c1c' }}>Connection Paused</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {connectWarning}
            </p>
            <button className="btn btn-primary" style={{ marginTop: '24px', width: '100%', padding: '10px' }} onClick={() => setConnectWarning(null)}>
              Okay, I'll open it
            </button>
          </div>
        </div>
      )}

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
                  const isActive = c.id === activeCompanyId;
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