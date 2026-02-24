// src/components/Reports.jsx
import React from "react";

const Reports = () => {
  const reports = [
    { id: 1, name: "Invoice Summary", type: "Monthly", lastRun: "2024-01-15" },
    { id: 2, name: "Tax Liability Report", type: "Quarterly", lastRun: "2024-01-14" },
    { id: 3, name: "Mapping Status", type: "Daily", lastRun: "2024-01-15" },
    { id: 4, name: "Tally Sync Log", type: "On-demand", lastRun: "2024-01-13" },
    { id: 5, name: "GST Reconciliation", type: "Monthly", lastRun: "2024-01-10" }
  ];

  return (
    <div className="reports-page">
      <h2>Reports</h2>
      
      <div className="reports-grid">
        {reports.map(report => (
          <div className="report-card" key={report.id}>
            <div className="report-icon">📊</div>
            <div className="report-details">
              <h3>{report.name}</h3>
              <p>Type: {report.type} | Last Run: {report.lastRun}</p>
            </div>
            <div className="report-actions">
              <button className="btn-icon">▶️</button>
              <button className="btn-icon">📥</button>
              <button className="btn-icon">⚙️</button>
            </div>
          </div>
        ))}
      </div>

      <div className="custom-report">
        <h3>Generate Custom Report</h3>
        <div className="report-form">
          <select className="form-select">
            <option>Select Report Type</option>
            <option>Invoice Report</option>
            <option>Tax Report</option>
            <option>Mapping Report</option>
          </select>
          <input type="date" className="form-input" />
          <input type="date" className="form-input" />
          <button className="btn btn-primary">Generate</button>
        </div>
      </div>
    </div>
  );
};

export default Reports;