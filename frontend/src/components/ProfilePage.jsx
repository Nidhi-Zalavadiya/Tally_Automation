// src/components/ProfilePage.jsx
// User profile page accessible from the sidebar.
// Shows all user info: name, email, phone, verification status, account dates.
// Allows editing first_name, last_name, phone.

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../services/api';
import './ProfilePage.css';

/* ── Small helpers ──────────────────────────────────────────── */
function Badge({ ok, label }) {
  return (
    <span className={`pp-badge ${ok ? 'pp-badge--ok' : 'pp-badge--no'}`}>
      {ok
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      }
      {label}
    </span>
  );
}

function InfoRow({ icon, label, value, children }) {
  return (
    <div className="pp-info-row">
      <span className="pp-info-icon">{icon}</span>
      <div className="pp-info-body">
        <div className="pp-info-label">{label}</div>
        <div className="pp-info-value">{children || value || <span className="pp-dimmed">Not set</span>}</div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(user) {
  if (user.first_name) return (user.first_name[0] + (user.last_name?.[0] || '')).toUpperCase();
  return user.email?.[0]?.toUpperCase() || '?';
}

/* ═══════════════════════════════════════════════════════════
   ProfilePage
════════════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const { user, login: _login } = useAuth();

  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [error,    setError]    = useState('');

  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [phoneErr, setPhoneErr] = useState('');

  // Fetch full profile from backend
  useEffect(() => {
    authApi.getProfile()
      .then(res => {
        setProfile(res.data);
        setForm({
          first_name: res.data.first_name || '',
          last_name:  res.data.last_name  || '',
          phone:      res.data.phone      || '',
        });
      })
      .catch(() => setError('Could not load profile. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'phone') setPhoneErr('');
    setSaveOk(false);
  };

  const handleSave = async () => {
    // Validate phone if filled
    const phone = form.phone.trim().replace(/\s/g, '');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      setPhoneErr('Enter a valid 10-digit Indian mobile number');
      return;
    }

    setSaving(true); setError(''); setSaveOk(false);
    try {
      const res = await authApi.updateProfile({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone,
      });
      // Update local profile display
      setProfile(p => ({
        ...p,
        first_name: res.data.first_name,
        last_name:  res.data.last_name,
        phone:      res.data.phone,
        // If phone changed, reset phone verified status
        is_phone_verified: res.data.phone !== profile.phone ? false : p.is_phone_verified,
      }));
      setForm(f => ({ ...f, phone }));
      setEditing(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not save. Please try again.');
    } finally { setSaving(false); }
  };

  const handleCancel = () => {
    setEditing(false);
    setPhoneErr('');
    setError('');
    if (profile) setForm({
      first_name: profile.first_name || '',
      last_name:  profile.last_name  || '',
      phone:      profile.phone      || '',
    });
  };

  /* ── Skeleton ─────────────────────────────────────────────── */
  if (loading) return (
    <div className="pp-wrap">
      <div className="pp-skeleton">
        <div className="pp-sk pp-sk--avatar" />
        <div className="pp-sk pp-sk--title" />
        <div className="pp-sk pp-sk--sub" />
        <div className="pp-sk pp-sk--line" />
        <div className="pp-sk pp-sk--line" />
        <div className="pp-sk pp-sk--line" />
      </div>
    </div>
  );

  if (!profile) return (
    <div className="pp-wrap">
      <div className="pp-error">{error || 'Profile unavailable.'}</div>
    </div>
  );

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'No name set';

  return (
    <div className="pp-wrap">

      {/* ── Hero card ─────────────────────────────────────── */}
      <div className="pp-hero">
        <div className="pp-avatar">{getInitials(profile)}</div>
        <div className="pp-hero-info">
          <h2 className="pp-hero-name">{fullName}</h2>
          <p className="pp-hero-email">{profile.email}</p>
          <div className="pp-badges">
            <Badge ok={profile.is_email_verified} label="Email verified" />
            <Badge ok={!!profile.phone} label={profile.phone ? `+91 ${profile.phone}` : 'No phone'} />
          </div>
        </div>
        {!editing && (
          <button className="pp-edit-btn" onClick={() => setEditing(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Profile
          </button>
        )}
      </div>

      {/* ── Success toast ──────────────────────────────────── */}
      {saveOk && (
        <div className="pp-toast pp-toast--ok">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Profile updated successfully!
        </div>
      )}
      {error && <div className="pp-toast pp-toast--err">{error}</div>}

      <div className="pp-grid">

        {/* ── EDIT FORM ────────────────────────────────────── */}
        {editing ? (
          <div className="pp-card pp-card--edit">
            <h3 className="pp-card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Edit Profile
            </h3>

            <div className="pp-form-row">
              <div className="pp-field">
                <label className="pp-lbl">First Name</label>
                <input className="pp-inp" type="text" placeholder="Rahul"
                  value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </div>
              <div className="pp-field">
                <label className="pp-lbl">Last Name</label>
                <input className="pp-inp" type="text" placeholder="Shah"
                  value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>

            <div className="pp-field">
              <label className="pp-lbl">Mobile Number
                <span className="pp-lbl-note"> — optional</span>
              </label>
              <div className="pp-phone-wrap">
                <span className="pp-phone-prefix">🇮🇳 +91</span>
                <input className={`pp-inp pp-inp--phone${phoneErr ? ' pp-inp--err' : ''}`}
                  type="tel" placeholder="98765 43210" maxLength={10}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value.replace(/\D/g, ''))} />
              </div>
              {phoneErr && <span className="pp-field-err">{phoneErr}</span>}
              <span className="pp-field-hint">Phone is saved but not verified yet</span>
            </div>

            <div className="pp-field">
              <label className="pp-lbl">Email Address
                <span className="pp-lbl-note"> — cannot be changed here</span>
              </label>
              <input className="pp-inp pp-inp--disabled" type="email"
                value={profile.email} disabled />
            </div>

            <div className="pp-edit-actions">
              <button className="pp-btn pp-btn--save" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span className="pp-spin" /> Saving…</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Save Changes</>
                }
              </button>
              <button className="pp-btn pp-btn--cancel" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>

        ) : (
          /* ── INFO VIEW ──────────────────────────────────── */
          <>
            <div className="pp-card">
              <h3 className="pp-card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Personal Information
              </h3>
              <InfoRow icon="👤" label="Full Name" value={fullName} />
              <InfoRow icon="📧" label="Email Address">
                {profile.email}
                <Badge ok={profile.is_email_verified} label={profile.is_email_verified ? 'Verified' : 'Not verified'} />
              </InfoRow>
              <InfoRow icon="📱" label="Mobile Number">
                {profile.phone
                  ? <><span>+91 {profile.phone}</span></>
                  : <span className="pp-dimmed">Not added — <button className="pp-lnk" onClick={() => setEditing(true)}>add now</button></span>
                }
              </InfoRow>
            </div>

            <div className="pp-card">
              <h3 className="pp-card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Account Activity
              </h3>
              <InfoRow icon="🗓️" label="Member Since"   value={formatDate(profile.date_joined)} />
              <InfoRow icon="🔑" label="Last Sign In"   value={formatDate(profile.last_login)}  />
            </div>

            <div className="pp-card">
              <h3 className="pp-card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Security &amp; Verification
              </h3>
              <InfoRow icon="📧" label="Email Verification">
                <Badge ok={profile.is_email_verified} label={profile.is_email_verified ? 'Email verified' : 'Email not verified'} />
              </InfoRow>
              <InfoRow icon="📱" label="Phone Verification">
                {profile.phone
                  ? <Badge ok={profile.is_phone_verified} label={profile.is_phone_verified ? 'Phone verified' : 'Phone not verified'} />
                  : <span className="pp-dimmed">Add a phone number to verify it</span>
                }
              </InfoRow>
            </div>
          </>
        )}

      </div>
    </div>
  );
}