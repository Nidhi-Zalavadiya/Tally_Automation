// src/components/Dashboard.jsx
import './Dashboard.css';
import React, { useEffect, useState } from 'react';
import { useAppState } from '../context/AppstateContext';
import { companies as companiesApi } from '../services/api';

const Dashboard = ({ setActiveMenu }) => {
  const { companies, mergeCompanies, uploadedInvoices, mappingStatus,activeCompanyId, setActiveCompanyId } = useAppState();
  const [loading, setLoading] = useState(companies.length===0);

  // ── Fetch companies from DB on mount ─────────────────────────
  useEffect(() => {
  if (companies.length === 0) {
    let isSubscribed = true;

    // Use a function to ensure it's handled in the next tick 
    // or simply start the fetch and let the async nature handle it
    const fetchData = async () => {
      setLoading(true); // Now it's inside an async scope
      try {
        const r = await companiesApi.list();
        if (isSubscribed) mergeCompanies(r.data.companies || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    fetchData();
    return () => { isSubscribed = false; };
  }
}, [companies.length, mergeCompanies]);

  const totalStock   = companies.reduce((s, c) => s + (c.stock_items?.length || 0), 0);
  const totalLedgers = companies.reduce((s, c) => s + (c.ledgers?.length || 0), 0);
  const _totalMapped  = Object.values(mappingStatus).reduce((s, v) => s + v.mapped, 0);

  return (
    <div className="dashboard">
      {/* ── KPI Stats ── */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => setActiveMenu('companies')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon blue">🏢</div>
          <div className="stat-content">
            <span className="stat-label">Connected Companies</span>
            <span className="stat-value">{loading ? '…' : companies.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">📦</div>
          <div className="stat-content">
            <span className="stat-label">Total Stock Items</span>
            <span className="stat-value">{totalStock}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">📒</div>
          <div className="stat-content">
            <span className="stat-label">Total Ledgers</span>
            <span className="stat-value">{totalLedgers}</span>
          </div>
        </div>
        <div className="stat-card" onClick={() => setActiveMenu('invoices')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon purple">📄</div>
          <div className="stat-content">
            <span className="stat-label">Invoices Loaded</span>
            <span className="stat-value">{uploadedInvoices.length}</span>
          </div>
        </div>
      </div>

      {/* ── Companies Table ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Your Companies</h3>
          <button className="btn btn-outline btn-sm" onClick={() => setActiveMenu('tally')}>
            + Connect →
          </button>
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
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <p>{loading ? 'Loading companies…' : 'No companies connected yet.'}</p>
                    {!loading && <button className="btn btn-primary btn-sm" onClick={() => setActiveMenu('tally')}>Connect to Tally</button>}
                  </div>
                </td></tr>
              ) : (
                companies.map((c) => {
                  const isActive = c.id === activeCompanyId; // <-- strict check
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.company_name}</strong></td>
                      <td>{c.connected_at ? new Date(c.connected_at).toLocaleDateString('en-IN') : '—'}</td>
                      <td><span className="badge badge-blue">{c.ledgers?.length ?? '—'}</span></td>
                      <td><span className="badge badge-purple">{c.stock_items?.length ?? '—'}</span></td>
                      <td><span className="badge badge-green">{c.units?.length ?? '—'}</span></td>
                      
                      {/* NEW: Conditional Badge / Button */}
                      <td>
                        {isActive 
                          ? <span className="badge badge-green">● Active</span>
                          : <button className="btn btn-outline btn-xs" onClick={() => setActiveCompanyId(c.id)}>Set Active</button>
                        }
                      </td>
                      
                      <td>
                        <button className="btn btn-outline btn-xs" onClick={() => setActiveMenu('invoices')}>
                          Upload Invoice →
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-row">
          {[
            { icon: '🔌', label: 'Connect Tally',   page: 'tally'    },
            { icon: '📄', label: 'Upload Invoices', page: 'invoices' },
            { icon: '⚙️', label: 'Settings',        page: 'settings' },
          ].map((q) => (
            <button key={q.page} className="action-btn" onClick={() => setActiveMenu(q.page)}>
              <span>{q.icon}</span>{q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;