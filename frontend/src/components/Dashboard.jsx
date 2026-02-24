// src/components/Dashboard.jsx
import React from 'react';
import './dashboard.css'

const Dashboard = ({ companies, setActiveMenu }) => {
  return (
    <div className="dashboard">

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">🏢</div>
          <div className="stat-content">
            <span className="stat-label">Connected Companies</span>
            <span className="stat-value">{companies.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">📦</div>
          <div className="stat-content">
            <span className="stat-label">Total Stock Items</span>
            <span className="stat-value">
              {companies.reduce((s, c) => s + (c.stock_items?.length || 0), 0)}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">📒</div>
          <div className="stat-content">
            <span className="stat-label">Total Ledgers</span>
            <span className="stat-value">
              {companies.reduce((s, c) => s + (c.ledgers?.length || 0), 0)}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">📄</div>
          <div className="stat-content">
            <span className="stat-label">Invoices This Session</span>
            <span className="stat-value">0</span>
          </div>
        </div>
      </div>

      {/* Connected Companies */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Connected Companies</h3>
          <button className="btn btn-outline btn-sm" onClick={() => setActiveMenu('tally')}>
            + Connect →
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Connected At</th>
                <th>Ledgers</th>
                <th>Stock Items</th>
                <th>Units</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No companies connected yet.</p>
                      <button className="btn btn-primary btn-sm" onClick={() => setActiveMenu('tally')}>
                        Connect to Tally
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                companies.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.company_name}</strong></td>
                    <td>{new Date(c.connected_at).toLocaleTimeString('en-IN')}</td>
                    <td><span className="badge badge-blue">{c.ledgers?.length ?? 0}</span></td>
                    <td><span className="badge badge-purple">{c.stock_items?.length ?? 0}</span></td>
                    <td><span className="badge badge-green">{c.units?.length ?? 0}</span></td>
                    <td><span className="badge badge-green">● Active</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-row">
          {[
            { icon: '🔌', label: 'Connect Tally',   page: 'tally'    },
            { icon: '📄', label: 'Upload Invoices', page: 'invoices' },
            { icon: '⚙️', label: 'Settings',        page: 'settings' },
          ].map((q) => (
            <button key={q.page} className="action-btn" onClick={() => setActiveMenu(q.page)}>
              <span>{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;