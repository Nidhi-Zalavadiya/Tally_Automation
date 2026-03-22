// src/components/Companies.jsx
import React, { useState } from 'react';
import { useAppState } from '../context/AppstateContext';

const Companies = ({ setActiveMenu }) => {
  const { companies, activeCompanyId, refreshCompanyMasters } = useAppState();
  
  const [search, setSearch] = useState('');
  const [reconnecting, setReconnecting] = useState(null);
  
  // 🟢 NEW: State to control our beautiful custom popup
  const [syncError, setSyncError] = useState(null);

  const safeCompanies = Array.isArray(companies) ? companies : (companies?.companies || []);
  const filtered = safeCompanies.filter((c) =>
    c?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleReconnect = async (company) => {
    setReconnecting(company.id);
    try {
      const res = await refreshCompanyMasters(company.id); 
      
      // 🟢 Trigger our custom popup instead of the ugly browser alert
      if (res && res.ok === false) {
        setSyncError(res.message);
      }
    } catch (e) {
      let errorMsg = e.message;
      if (e.response?.data?.detail) {
        errorMsg = typeof e.response.data.detail === 'string' 
          ? e.response.data.detail 
          : JSON.stringify(e.response.data.detail);
      }
      setSyncError(errorMsg);
    } finally {
      setReconnecting(null);
    }
  };

  return (
    <div className="companies-page">
      
      {/* 🟢 NEW: Custom In-App Modal Popup */}
      {syncError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }} onClick={() => setSyncError(null)}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)', padding: '30px 32px',
            borderRadius: '12px', maxWidth: '400px', width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', 
            textAlign: 'center', border: '1px solid var(--border)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#b91c1c' }}>Sync Failed</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {syncError}
            </p>
            <button className="btn btn-primary" style={{ marginTop: '24px', width: '100%', padding: '10px' }} onClick={() => setSyncError(null)}>
              Okay, I'll open it
            </button>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>Companies</h2>
          <p className="sub-text">
            Your Tally companies. Active = synced this session. Connect again after login to sync ledgers.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setActiveMenu('tally')}>
          + Connect Company
        </button>
      </div>

      <div className="filters-section">
        <input
          type="text"
          className="form-control"
          placeholder="🔍 Search companies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Last Connected</th>
                <th>Ledgers</th>
                <th>Stock Items</th>
                <th>Units</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No companies found.</p>
                      <button className="btn btn-primary btn-sm" onClick={() => setActiveMenu('tally')}>
                        Connect to Tally
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const isActive = activeCompanyId === c.id;
                  const isReconnecting = reconnecting === c.id;
                  
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.company_name}</strong></td>
                      <td>
                        {c.connected_at
                          ? new Date(c.connected_at).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : 'N/A'}
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          {isActive ? (c.ledgers?.length ?? 0) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-purple">
                          {isActive ? (c.stock_items?.length ?? 0) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-green">
                          {isActive ? (c.units?.length ?? 0) : '—'}
                        </span>
                      </td>
                      <td>
                        {isActive
                          ? <span className="badge badge-green">● Active</span>
                          : <span className="badge badge-gray">○ Inactive</span>
                        }
                      </td>
                      <td>
                        {isActive ? (
                          <span className="muted" style={{ fontSize: 12 }}>Synced ✓</span>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={isReconnecting}
                            onClick={() => handleReconnect(c)}
                          >
                            {isReconnecting ? 'Connecting…' : '↺ Re-sync'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginTop: 16, fontSize: 13 }}>
        💡 <strong>Why Inactive?</strong> Ledger and stock item data is fetched live from Tally when you connect.
        After logout, the session clears. Click <strong>Re-sync</strong> to reconnect to Tally and reload masters.
      </div>
    </div>
  );
};

export default Companies;