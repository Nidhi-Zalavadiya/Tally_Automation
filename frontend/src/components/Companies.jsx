// src/components/Companies.jsx
import React, { useState } from 'react';
import { companies as companiesApi } from '../services/api';
import { useAppState } from '../context/AppstateContext';

// activeCompanyIds = Set of company IDs currently synced this session
const Companies = ({ companies = [], activeCompanyIds = new Set(), onReconnect, setActiveMenu }) => {
  const [search,       setSearch]       = useState('');
  const [reconnecting, setReconnecting] = useState(null); // company id being reconnected

  // Normalize — backend returns { companies: [...] } or plain array
  const safeCompanies = Array.isArray(companies)
    ? companies
    : (companies?.companies || []);

  const filtered = safeCompanies.filter((c) =>
    c?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleReconnect = async (company) => {
    setReconnecting(company.id);
    try {
      if (onReconnect) await onReconnect(company.company_name);
    } catch (e) {
      alert('Reconnect failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setReconnecting(null);
    }
  };

  return (
    <div className="companies-page">
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
                  const isActive = activeCompanyIds.has(c.id);
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

      {/* Info note */}
      <div className="alert alert-info" style={{ marginTop: 16, fontSize: 13 }}>
        💡 <strong>Why Inactive?</strong> Ledger and stock item data is fetched live from Tally when you connect.
        After logout, the session clears. Click <strong>Re-sync</strong> to reconnect to Tally and reload masters.
      </div>
    </div>
  );
};

export default Companies;