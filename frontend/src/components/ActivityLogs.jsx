import React, { useState, useEffect, useCallback } from "react";
import { activities as activityApi } from "../services/api";

const ActivityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: '', status: '' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await activityApi.list(filter);
      setLogs(response.data.results || response.data);
    } catch (err) {
      console.error("Failed to load logs", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="activity-logs">
      <h2>Activity Logs</h2>
      
      <div className="logs-filter">
        <select onChange={(e) => setFilter({...filter, action: e.target.value})} value={filter.action}>
          <option value="">All Actions</option>
          <option value="Mapping">Mapping</option>
          <option value="Sync">Sync</option>
        </select>
        <select onChange={(e) => setFilter({...filter, status: e.target.value})} value={filter.status}>
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="logs-table-container">
        {loading ? <p>Loading logs...</p> : (
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
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.user}</td>
                  <td><span className={`status-badge ${log.status}`}>{log.status}</span></td>
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