// src/pages/AuthPage.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [mode,   setMode]   = useState('login');  // 'login' | 'signup'
  const [form,   setForm]   = useState({ email: '', password: '', first_name: '', last_name: '' });
  const [error,  setError]  = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setError('');
    if (!form.email || !form.password) { setError('Email and password are required'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        if (form.password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
        await signup(form.email, form.password, form.first_name, form.last_name);
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-brand">
          <span className="auth-logo-icon">⚡</span>
          <div>
            <div className="auth-brand-name">EInvoice Pro</div>
            <div className="auth-brand-sub">Tally Integration Platform</div>
          </div>
        </div>

        <div className="auth-illustration">
          <div className="auth-feature">
            <span className="feat-icon">📄</span>
            <div>
              <div className="feat-title">JWT Invoice Parsing</div>
              <div className="feat-desc">Decode GST e-invoices instantly</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="feat-icon">🔌</span>
            <div>
              <div className="feat-title">Tally Integration</div>
              <div className="feat-desc">Push vouchers directly to Tally Prime</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="feat-icon">⚡</span>
            <div>
              <div className="feat-title">Smart Mapping</div>
              <div className="feat-desc">AI-assisted item mapping with memory</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="feat-icon">📊</span>
            <div>
              <div className="feat-title">Excel Export</div>
              <div className="feat-desc">Download invoices in Excel format</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
            <p>{mode === 'login' ? 'Sign in to your account' : 'Start your free account'}</p>
          </div>

          {/* Tab switcher */}
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'login'  ? 'active' : ''}`} onClick={() => { setMode('login');  setError(''); }}>Login</button>
            <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>Sign Up</button>
          </div>

          <div className="auth-form">
            {mode === 'signup' && (
              <div className="auth-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-control" placeholder="Rahul" value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-control" placeholder="Shah" value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-control"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-control"
                type="password"
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="btn btn-primary auth-submit" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            <p className="auth-switch">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              &nbsp;
              <button className="auth-switch-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
                {mode === 'login' ? 'Sign Up' : 'Login'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}