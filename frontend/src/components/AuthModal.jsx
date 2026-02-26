// src/components/AuthModal.jsx
// Overlays the actual app — full shell stays rendered behind, blurred
// Tabs: Sign In | Create Account | Verify Email OTP

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../services/api';
import './AuthModal.css';

/* ── Helpers ──────────────────────────────────────────────── */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^[6-9]\d{9}$/;  // Indian mobile: starts 6-9, 10 digits total

function pwStrength(pw) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 8)            s++;
  if (pw.length >= 12)           s++;
  if (/[A-Z]/.test(pw))          s++;
  if (/[0-9]/.test(pw))          s++;
  if (/[^A-Za-z0-9]/.test(pw))   s++;
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

/* ── OTP 6-box ───────────────────────────────────────────── */
function OtpBoxes({ value, onChange }) {
  const boxes  = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const handle = (i, e) => {
    e.preventDefault();
    if (e.key === 'Backspace') {
      const next = [...digits]; next[i] = '';
      onChange(next.join(''));
      if (i > 0) boxes.current[i - 1]?.focus();
    } else if (/^\d$/.test(e.key)) {
      const next = [...digits]; next[i] = e.key;
      onChange(next.join(''));
      if (i < 5) boxes.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    boxes.current[Math.min(pasted.length, 5)]?.focus();
    e.preventDefault();
  };

  return (
    <div className="otp-row" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input key={i} ref={(r) => (boxes.current[i] = r)}
          className={`otp-box${d ? ' filled' : ''}`}
          type="text" inputMode="numeric" maxLength={1}
          value={d} readOnly
          onKeyDown={(e) => handle(i, e)}
          onFocus={(e) => e.target.select()} />
      ))}
    </div>
  );
}

/* ── Password strength bar ───────────────────────────────── */
function StrengthMeter({ pw }) {
  const s = pwStrength(pw);
  if (!s) return null;
  return (
    <div className="strength-row">
      <div className="strength-track">
        <div className="strength-fill" style={{ width: `${s.pct}%`, background: s.color }} />
      </div>
      <span className="strength-label" style={{ color: s.color }}>{s.label}</span>
    </div>
  );
}

/* ── Field wrapper ───────────────────────────────────────── */
function Field({ label, error, hint, children }) {
  return (
    <div className={`am-field${error ? ' error' : ''}`}>
      {label && <label className="am-lbl">{label}</label>}
      {children}
      {error && (
        <span className="am-err">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </span>
      )}
      {hint && !error && <span className="am-hint">{hint}</span>}
    </div>
  );
}

/* ── Input with icon / suffix ────────────────────────────── */
function InputBox({ icon, suffix, valid, type = 'text', ...props }) {
  return (
    <div className="am-inp-wrap">
      {icon && <span className="am-inp-ico">{icon}</span>}
      <input
        className={`am-inp${icon ? ' has-icon' : ''}${suffix ? ' has-suffix' : ''}`}
        type={type} {...props}
      />
      {suffix && <span className="am-inp-sfx">{suffix}</span>}
      {valid && (
        <span className="am-inp-ok">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      )}
    </div>
  );
}

/* SVG icons (reused) */
const EmailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const EyeOpen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const ErrIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

/* ═══════════════════════════════════════════════════════════
   MAIN MODAL
══════════════════════════════════════════════════════════ */
export default function AuthModal() {
  const { login, signup, finishLogin } = useAuth();

  const [tab,        setTab]       = useState('login'); // login | signup | otp | done
  const [form,       setForm]      = useState({
    email: '', password: '', phone: '', first_name: '', last_name: '', showPw: false,
  });
  const [errs,       setErrs]      = useState({});
  const [gErr,       setGErr]      = useState('');
  const [busy,       setBusy]      = useState(false);
  const [otp,        setOtp]       = useState('');
  const [countdown,  setCD]        = useState(0);
  const [pendingUid, setPendingUid] = useState(null); // user_id returned by /signup

  const set       = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrs(p => ({ ...p, [k]: '' })); };
  const switchTab = (t)    => { setTab(t); setErrs({}); setGErr(''); };

  // 30-second countdown for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCD(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ── Validate ─────────────────────────────────────────── */
  const validate = useCallback(() => {
    const e = {};
    if (!RE_EMAIL.test(form.email))   e.email    = 'Enter a valid email address';
    if (form.password.length < 6)     e.password = 'Password must be at least 6 characters';
    if (tab === 'signup') {
      if (!form.first_name.trim())    e.first_name = 'First name is required';
      // Phone is optional but if filled must be valid
      if (form.phone.trim() && !RE_PHONE.test(form.phone))
                                      e.phone = 'Enter a valid 10-digit Indian mobile number';
      const s = pwStrength(form.password);
      if (!s || s.pct < 40)           e.password = 'Use a stronger password (8+ chars, mix letters/numbers)';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  }, [form, tab]);

  /* ── Login ────────────────────────────────────────────── */
  const doLogin = async () => {
    if (!validate()) return;
    setBusy(true); setGErr('');
    try {
      await login(form.email, form.password);
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Sign in failed. Please try again.');
    } finally { setBusy(false); }
  };

  /* ── Signup → send email OTP → show OTP screen ───────── */
  const doSignup = async () => {
    if (!validate()) return;
    setBusy(true); setGErr('');
    try {
      // signup() stores token as pending_token (not auth_token yet)
      const data = await signup(form.email, form.password, form.first_name, form.last_name, form.phone);
      setPendingUid(data.user_id); // needed for verify-otp call
      setCD(30);
      setOtp('');
      setTab('otp');
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Signup failed. Please try again.');
    } finally { setBusy(false); }
  };

  /* ── Verify email OTP ─────────────────────────────────── */
  const doVerify = async () => {
    if (otp.replace(/\s/g, '').length < 6) { setGErr('Enter the complete 6-digit code'); return; }
    setBusy(true); setGErr('');
    try {
      await authApi.verifyOtp(pendingUid, otp); // POST /api/auth/verify-otp
      finishLogin();   // promotes pending_token → auth_token, sets user state
      setTab('done');  // modal auto-closes (only renders when !user)
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Incorrect code. Please try again.');
    } finally { setBusy(false); }
  };

  /* ── Resend email OTP ─────────────────────────────────── */
  const doResend = async () => {
    setCD(30); setOtp(''); setGErr('');
    try {
      await authApi.resendOtp(pendingUid); // POST /api/auth/resend-otp
    } catch (e) {
      setGErr(e.response?.data?.detail || 'Could not resend. Please try again.');
    }
  };

  const emailOk = RE_EMAIL.test(form.email);
  const phoneOk = RE_PHONE.test(form.phone);

  /* ── Render ───────────────────────────────────────────── */
  return (
    <>
      {/* Full-screen frosted-glass backdrop */}
      <div className="am-backdrop" />

      <div className="am-modal" role="dialog" aria-modal="true">

        {/* ── LEFT — branding panel ───────────────────── */}
        <div className="am-left">
          <span className="am-glow g1" /><span className="am-glow g2" /><span className="am-glow g3" />

          <div className="am-brand">
            <div className="am-logo">⚡</div>
            <div>
              <div className="am-name">EInvoice <em>Pro</em></div>
              <div className="am-sub">Tally Integration Platform</div>
            </div>
          </div>

          <div className="am-hero">
            <h2>Automate your<br /><mark>GST workflow</mark></h2>
            <p>Connect Tally Prime, decode JWT e-invoices and push vouchers — all in one place.</p>
          </div>

          <ul className="am-feats">
            {[
              { ico: '📄', t: 'JWT Invoice Parsing',  s: 'Decode GST e-invoices instantly'  },
              { ico: '🔌', t: 'Tally Prime Push',     s: 'Send XML vouchers directly'       },
              { ico: '⚡', t: 'Smart Item Mapping',   s: 'AI-assisted, remembers history'   },
              { ico: '📊', t: 'Excel & XML Export',   s: 'One-click downloads anytime'      },
            ].map((f, i) => (
              <li key={i} className="am-feat" style={{ '--d': `${i * 70}ms` }}>
                <span className="am-feat-ico">{f.ico}</span>
                <span><strong>{f.t}</strong><small>{f.s}</small></span>
              </li>
            ))}
          </ul>

          <div className="am-social-proof">
            <div className="am-avatars">
              {['R','S','M','P'].map((l, i) => (
                <span key={i} className="am-av" style={{ '--i': i }}>{l}</span>
              ))}
            </div>
            <span><strong>1,200+</strong> businesses trust EInvoice Pro</span>
          </div>
        </div>

        {/* ── RIGHT — form panel ──────────────────────── */}
        <div className="am-right">

          {/* Tab bar — hidden on OTP + done screens */}
          {(tab === 'login' || tab === 'signup') && (
            <div className="am-tabbar">
              <button className={`am-tb${tab === 'login'  ? ' on' : ''}`} onClick={() => switchTab('login')}>
                Sign In
              </button>
              <button className={`am-tb${tab === 'signup' ? ' on' : ''}`} onClick={() => switchTab('signup')}>
                Create Account
              </button>
              <span className="am-tb-line" style={{ left: tab === 'login' ? '0' : '50%' }} />
            </div>
          )}

          {/* ══════ SIGN IN ══════ */}
          {tab === 'login' && (
            <div className="am-form">
              <div className="am-fhdr">
                <h3>Welcome back 👋</h3>
                <p>Sign in to your EInvoice Pro account</p>
              </div>

              <Field label="Email address" error={errs.email}>
                <InputBox icon={<EmailIcon />}
                  type="email" placeholder="you@company.com"
                  value={form.email} onChange={e => set('email', e.target.value)}
                  valid={emailOk} onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </Field>

              <Field label="Password" error={errs.password}>
                <InputBox icon={<LockIcon />}
                  suffix={
                    <button className="am-eye" onClick={() => set('showPw', !form.showPw)}>
                      {form.showPw ? <EyeOff /> : <EyeOpen />}
                    </button>
                  }
                  type={form.showPw ? 'text' : 'password'} placeholder="Your password"
                  value={form.password} onChange={e => set('password', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </Field>

              {gErr && <div className="am-gerr"><ErrIcon />{gErr}</div>}

              <button className="am-btn" onClick={doLogin} disabled={busy}>
                {busy ? <span className="am-spin" /> : <>Sign In <ArrowIcon /></>}
              </button>

              <p className="am-switch">
                Don't have an account?&nbsp;
                <button className="am-lnk" onClick={() => switchTab('signup')}>Create one free →</button>
              </p>
            </div>
          )}

          {/* ══════ CREATE ACCOUNT ══════ */}
          {tab === 'signup' && (
            <div className="am-form">
              <div className="am-fhdr">
                <h3>Get started free 🚀</h3>
                <p>Set up your account — takes less than a minute</p>
              </div>

              <div className="am-row2">
                <Field label="First Name" error={errs.first_name}>
                  <InputBox type="text" placeholder="Rahul"
                    value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                </Field>
                <Field label="Last Name">
                  <InputBox type="text" placeholder="Shah"
                    value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </Field>
              </div>

              <Field label="Email Address" error={errs.email}
                hint="A 6-digit verification code will be sent here">
                <InputBox icon={<EmailIcon />}
                  type="email" placeholder="you@company.com"
                  value={form.email} onChange={e => set('email', e.target.value)}
                  valid={emailOk} />
              </Field>

              <Field label="Mobile Number" error={errs.phone}
                hint="Optional — you can add it later from your profile">
                <InputBox
                  icon={<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>🇮🇳 +91</span>}
                  type="tel" placeholder="98765 43210" maxLength={10}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value.replace(/\D/g, ''))}
                  valid={phoneOk} />
              </Field>

              <Field label="Password" error={errs.password}>
                <InputBox icon={<LockIcon />}
                  suffix={
                    <span className="am-pw-btns">
                      {/* Suggest strong password */}
                      <button className="am-eye" title="Suggest strong password"
                        onClick={() => set('password', genPassword())}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                                   M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                      </button>
                      {/* Show/hide */}
                      <button className="am-eye" onClick={() => set('showPw', !form.showPw)}>
                        {form.showPw ? <EyeOff /> : <EyeOpen />}
                      </button>
                    </span>
                  }
                  type={form.showPw ? 'text' : 'password'} placeholder="Min 8 chars"
                  value={form.password} onChange={e => set('password', e.target.value)} />
                <StrengthMeter pw={form.password} />
              </Field>

              {gErr && <div className="am-gerr"><ErrIcon />{gErr}</div>}

              <button className="am-btn" onClick={doSignup} disabled={busy}>
                {busy ? <span className="am-spin" /> : <>Create Account &amp; Verify →</>}
              </button>

              <p className="am-switch">
                Already have an account?&nbsp;
                <button className="am-lnk" onClick={() => switchTab('login')}>Sign in →</button>
              </p>
            </div>
          )}

          {/* ══════ VERIFY EMAIL OTP ══════ */}
          {tab === 'otp' && (
            <div className="am-form am-otp">
              {/* Email icon instead of phone icon */}
              <div className="am-otp-ico">📧</div>

              <div className="am-fhdr" style={{ textAlign: 'center' }}>
                <h3>Check your email</h3>
                <p>We sent a 6-digit code to</p>
                {/* Show the email address they signed up with */}
                <strong className="am-phone-pill">{form.email}</strong>
              </div>

              <OtpBoxes value={otp} onChange={setOtp} />

              {gErr && (
                <div className="am-gerr" style={{ justifyContent: 'center' }}>{gErr}</div>
              )}

              <button className="am-btn"
                onClick={doVerify}
                disabled={busy || otp.replace(/\s/g, '').length < 6}>
                {busy ? <span className="am-spin" /> : <>Verify &amp; Continue →</>}
              </button>

              <div className="am-resend">
                {countdown > 0
                  ? <span className="am-cd">Resend code in <strong>{countdown}s</strong></span>
                  : <>
                      <span className="am-dimtxt">Didn't receive it? Check spam or</span>
                      <button className="am-lnk" onClick={doResend}>Resend →</button>
                    </>
                }
              </div>

              <button className="am-ghost" onClick={() => switchTab('signup')}>
                ← Change email
              </button>
            </div>
          )}

          {/* ══════ SUCCESS ══════ */}
          {tab === 'done' && (
            <div className="am-form am-done">
              <div className="am-done-ring">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none"
                     stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3>You're verified! 🎉</h3>
              <p>Email confirmed. You are now signed in and ready to use EInvoice Pro.</p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}