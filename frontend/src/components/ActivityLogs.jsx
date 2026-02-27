// src/components/ActivityLogs.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { activities as activityApi } from '../services/api';

const ActivityLogs = () => {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ action: '', status: '' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // FIX: was calling activityApi.list() which didn't exist → now .list() is defined
      const response = await activityApi.list(filter);
      setLogs(response.data?.results || response.data || []);
    } catch (err) {
      // Graceful fallback — activity logs endpoint may not exist yet
      console.warn('Activity logs not available:', err.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="activity-logs">
      <h2>Activity Logs</h2>

      <div className="logs-filter">
        <select
          onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          value={filter.action}
        >
          <option value="">All Actions</option>
          <option value="Mapping">Mapping</option>
          <option value="Sync">Sync</option>
          <option value="Upload">Upload</option>
          <option value="Download">Download</option>
        </select>
        <select
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          value={filter.status}
        >
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="logs-table-container">
        {loading ? (
          <p>Loading logs...</p>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <p>No activity logs found.</p>
            <p style={{ fontSize: 13 }}>Logs will appear here once you start using the app.</p>
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                  <td>{log.action}</td>
                  <td>{log.user}</td>
                  <td>
                    <span className={`status-badge ${log.status}`}>{log.status}</span>
                  </td>
                  <td>{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ActivityLogs;