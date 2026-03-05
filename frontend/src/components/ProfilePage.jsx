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
  if (user?.first_name) return (user.first_name[0] + (user.last_name?.[0] || '')).toUpperCase();
  return user?.email?.[0]?.toUpperCase() || '?';
}

export default function ProfilePage() {
  // Extract 'setUser' from your context to update global state
  const { user, setUser } = useAuth(); 

  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [error,    setError]    = useState('');

  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [phoneErr, setPhoneErr] = useState('');

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
      .catch((err) => {
        // If 401, the interceptor handles it. Otherwise:
        setError('Could not load profile. Please refresh.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
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

      const updatedData = {
        ...profile,
        first_name: res.data.first_name,
        last_name:  res.data.last_name,
        phone:      res.data.phone,
        is_phone_verified: res.data.phone !== profile.phone ? false : profile.is_phone_verified,
      };

      setProfile(updatedData);
      
      // CRITICAL: Update the global AuthContext so the Sidebar updates!
      if (setUser) {
        setUser(prev => ({ ...prev, ...updatedData }));
      }

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

  if (loading) return (
    <div className="pp-wrap">
      <div className="pp-skeleton">
        <div className="pp-sk pp-sk--avatar" />
        <div className="pp-sk pp-sk--title" />
        <div className="pp-sk pp-sk--sub" />
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
            Edit Profile
          </button>
        )}
      </div>

      {saveOk && <div className="pp-toast pp-toast--ok">Profile updated successfully!</div>}
      {error && <div className="pp-toast pp-toast--err">{error}</div>}

      <div className="pp-grid">
        {editing ? (
          <div className="pp-card pp-card--edit">
            <h3 className="pp-card-title">Edit Profile</h3>
            <div className="pp-form-row">
               <div className="pp-field">
                 <label className="pp-lbl">First Name</label>
                 <input className="pp-inp" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} />
               </div>
               <div className="pp-field">
                 <label className="pp-lbl">Last Name</label>
                 <input className="pp-inp" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} />
               </div>
            </div>
            <div className="pp-field">
              <label className="pp-lbl">Mobile Number</label>
              <div className="pp-phone-wrap">
                <span className="pp-phone-prefix">🇮🇳 +91</span>
                <input 
                  className={`pp-inp ${phoneErr ? 'pp-inp--err' : ''}`}
                  value={form.phone} 
                  maxLength={10}
                  onChange={e => setForm({...form, phone: e.target.value.replace(/\D/g, '')})} 
                />
              </div>
              {phoneErr && <span className="pp-field-err">{phoneErr}</span>}
            </div>
            <div className="pp-edit-actions">
              <button className="pp-btn pp-btn--save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="pp-btn pp-btn--cancel" onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="pp-card">
              <h3 className="pp-card-title">Personal Information</h3>
              <InfoRow icon="👤" label="Full Name" value={fullName} />
              <InfoRow icon="📧" label="Email Address" value={profile.email} />
              <InfoRow icon="📱" label="Mobile Number" value={profile.phone ? `+91 ${profile.phone}` : 'Not added'} />
            </div>
            <div className="pp-card">
              <h3 className="pp-card-title">Account Activity</h3>
              <InfoRow icon="🗓️" label="Member Since" value={formatDate(profile.date_joined)} />
              <InfoRow icon="🔑" label="Last Sign In" value={formatDate(profile.last_login)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}