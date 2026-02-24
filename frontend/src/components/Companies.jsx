// src/components/Companies.jsx
import React, { useState } from 'react';

const Companies = ({ companies, removeCompany, setActiveMenu }) => {
  const [search, setSearch] = useState('');

  const filtered = companies.filter((c) =>
    c.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="companies-page">
      <div className="page-header">
        <div>
          <h2>Companies</h2>
          <p className="sub-text">Companies connected this session via Tally</p>
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
                <th>Connected At</th>
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
                      <p>No companies connected yet.</p>
                      <button className="btn btn-primary btn-sm" onClick={() => setActiveMenu('tally')}>
                        Connect to Tally
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.company_name}</strong></td>
                    <td>{new Date(c.connected_at).toLocaleTimeString('en-IN')}</td>
                    <td><span className="badge badge-blue">{c.ledgers?.length ?? 0}</span></td>
                    <td><span className="badge badge-purple">{c.stock_items?.length ?? 0}</span></td>
                    <td><span className="badge badge-green">{c.units?.length ?? 0}</span></td>
                    <td><span className="badge badge-green">● Active</span></td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => {
                          if (window.confirm(`Remove ${c.company_name} from session?`))
                            removeCompany(c.id);
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Companies;