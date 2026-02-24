// src/components/ImportWizard.jsx
import React from "react";

const ImportWizard = () => {
  return (
    <div className="import-wizard">
      <h2>Import Wizard</h2>
      <div className="wizard-steps">
        <div className="step active">
          <span className="step-number">1</span>
          <span className="step-label">Upload File</span>
        </div>
        <div className="step">
          <span className="step-number">2</span>
          <span className="step-label">Validate Data</span>
        </div>
        <div className="step">
          <span className="step-number">3</span>
          <span className="step-label">Map Fields</span>
        </div>
        <div className="step">
          <span className="step-number">4</span>
          <span className="step-label">Import</span>
        </div>
      </div>

      <div className="upload-area-large">
        <div className="upload-icon">📤</div>
        <h3>Drag & Drop your file here</h3>
        <p>Supported formats: JSON (Signed), CSV, Excel</p>
        <button className="btn btn-primary">Browse Files</button>
      </div>
    </div>
  );
};

export default ImportWizard;