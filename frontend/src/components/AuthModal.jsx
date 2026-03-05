import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../services/api';
import './AuthModal.css';

/* ── Helpers ──────────────────────────────────────────────── */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^[6-9]\d{9}$/;

function pwStrength(pw) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    null,
    { label: 'Too weak',  color: '#ef4444', pct: 20  },
    { label: 'Weak',      color: '#f97316', pct: 40  },
    { label: 'Fair',      color: '#f59e0b', pct: 60  },
    { label: 'Strong',    color: '#22c55e', pct: 80  },
    { label: 'Excellent', color: '#06b6d4', pct: 100 },
  ];
  return map[Math.min(s, 5)];
}

function genPassword() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  return Array.from({ length: 14 }, () => pool[Math.floor(Math.random() * pool.length)]).join('');
}

/* ── OTP 6-box (Improved Focus) ───────────────────────────── */
function OtpBoxes({ value, onChange, disabled }) {
  const boxes = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  // Auto-focus first box on mount
  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const handle = (i, e) => {
    if (e.key === 'Backspace') {
      const next = [...digits];
      if (digits[i]) {
        next[i] = '';
      } else if (i > 0) {
        next[i - 1] = '';
        boxes.current[i - 1]?.focus();
      }
      onChange(next.join(''));
    } else if (/^\d$/.test(e.key)) {
      const next = [...digits];
      next[i] = e.key;
      onChange(next.join(''));
      if (i < 5) boxes.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    boxes.current[focusIdx]?.focus();
    e.preventDefault();
  };

  return (
    <div className="otp-row" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input key={i} ref={(r) => (boxes.current[i] = r)}
          className={`otp-box${d ? ' filled' : ''}`}
          type="text" inputMode="numeric"
          value={d} readOnly disabled={disabled}
          onKeyDown={(e) => handle(i, e)} />
      ))}
    </div>
  );
}

/* ── Visual Components ──────────────────────────────────── */
function StrengthMeter({ pw }) {
  const s = pwStrength(pw);
  if (!s) return null;
  return (
    <div className="strength-row">
      <div className="strength-track"><div className="strength-fill" style={{ width: `${s.pct}%`, background: s.color }} /></div>
      <span className="strength-label" style={{ color: s.color }}>{s.label}</span>
    </div>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div className={`am-field${error ? ' error' : ''}`}>
      {label && <label className="am-lbl">{label}</label>}
      {children}
      {error ? <span className="am-err">{error}</span> : hint && <span className="am-hint">{hint}</span>}
    </div>
  );
}

function InputBox({ icon, suffix, valid, type = 'text', ...props }) {
  return (
    <div className="am-inp-wrap">
      {icon && <span className="am-inp-ico">{icon}</span>}
      <input className={`am-inp ${icon ? 'has-icon' : ''} ${suffix ? 'has-suffix' : ''}`} type={type} {...props} />
      {suffix && <span className="am-inp-sfx">{suffix}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN MODAL
══════════════════════════════════════════════════════════ */
export default function AuthModal() {
  const { login, signup, finishLogin } = useAuth();

  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({
    email: '', password: '', phone: '', first_name: '', last_name: '', showPw: false,
  });
  const [errs, setErrs] = useState({});
  const [gErr, setGErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [countdown, setCD] = useState(0);
  const [pendingUid, setPendingUid] = useState(null);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrs(p => ({ ...p, [k]: '' })); };
  const switchTab = (t) => { setTab(t); setErrs({}); setGErr(''); };

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCD(n => n - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const validate = useCallback(() => {
    const e = {};
    if (!RE_EMAIL.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 6) e.password = 'Min 6 characters required';
    if (tab === 'signup') {
      if (!form.first_name.trim()) e.first_name = 'Required';
      if (form.phone && !RE_PHONE.test(form.phone)) e.phone = 'Invalid Indian number';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  }, [form, tab]);

  const doLogin = async () => {
    if (!validate()) return;
    setBusy(true); setGErr('');
    try {
      await login(form.email, form.password);
      // AuthContext will handle state/close
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Invalid credentials');
    } finally { setBusy(false); }
  };

  const doSignup = async () => {
    if (!validate()) return;
    setBusy(true); setGErr('');
    try {
      const res = await authApi.signup({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone
      });
      setPendingUid(res.data.user_id);
      setCD(30);
      setTab('otp');
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Registration failed');
    } finally { setBusy(false); }
  };

  const doVerify = async () => {
    if (otp.length < 6) return;
    setBusy(true); setGErr('');
    try {
      await authApi.verifyOtp(pendingUid, otp);
      if (finishLogin) finishLogin(); 
      setTab('done');
    } catch (e) {
      setGErr('Invalid verification code');
    } finally { setBusy(false); }
  };

  return (
    <div className="am-container">
      <div className="am-backdrop" />
      <div className="am-modal">
        {/* Branding (Left) */}
        <div className="am-left">
           <div className="am-brand">⚡ EInvoice Pro</div>
           <h2>Automate your <mark>GST workflow</mark></h2>
           <p>Connect Tally and decode JWT invoices instantly.</p>
        </div>

        {/* Form (Right) */}
        <div className="am-right">
          {tab === 'login' && (
            <div className="am-form">
              <h3>Welcome back</h3>
              <Field label="Email" error={errs.email}>
                <InputBox placeholder="you@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Password" error={errs.password}>
                <InputBox type={form.showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} />
              </Field>
              {gErr && <div className="am-gerr">{gErr}</div>}
              <button className="am-btn" onClick={doLogin} disabled={busy}>Sign In</button>
              <button className="am-lnk" onClick={() => switchTab('signup')}>Create account</button>
            </div>
          )}

          {tab === 'signup' && (
            <div className="am-form">
              <h3>Create Account</h3>
              <div className="am-row2">
                <Field label="First Name" error={errs.first_name}>
                  <InputBox value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                </Field>
                <Field label="Last Name">
                  <InputBox value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </Field>
              </div>
              <Field label="Email" error={errs.email}>
                <InputBox value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Password" error={errs.password}>
                <InputBox type="password" value={form.password} onChange={e => set('password', e.target.value)} />
                <StrengthMeter pw={form.password} />
              </Field>
              {gErr && <div className="am-gerr">{gErr}</div>}
              <button className="am-btn" onClick={doSignup} disabled={busy}>Register</button>
              <button className="am-lnk" onClick={() => switchTab('login')}>Back to login</button>
            </div>
          )}

          {tab === 'otp' && (
            <div className="am-form am-center">
              <h3>Verify Email</h3>
              <p>Enter the code sent to <b>{form.email}</b></p>
              <OtpBoxes value={otp} onChange={setOtp} disabled={busy} />
              {gErr && <div className="am-gerr">{gErr}</div>}
              <button className="am-btn" onClick={doVerify} disabled={busy || otp.length < 6}>Verify</button>
              <div className="am-resend">
                {countdown > 0 ? `Resend in ${countdown}s` : <button onClick={() => setCD(30)}>Resend Code</button>}
              </div>
            </div>
          )}

          {tab === 'done' && (
            <div className="am-form am-center">
              <div className="am-success-icon">✔️</div>
              <h3>All set!</h3>
              <p>Your account is verified. Welcome aboard.</p>
              <button className="am-btn" onClick={() => window.location.reload()}>Go to Dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}