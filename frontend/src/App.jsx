// src/App.jsx
import React, { useState, useEffect } from 'react';
import './App.css';
import { ThemeProvider, useTheme }       from './context/ThemeContext';
import { AuthProvider, useAuth }         from './context/AuthContext';
import { AppStateProvider, useAppState } from './context/AppstateContext';

import AuthModal        from './components/AuthModal';
import Dashboard        from './components/Dashboard';
import Companies        from './components/Companies';
import InvoiceMapping   from './components/InvoiceMapping';
import Settings         from './components/Settings';
import TallyIntegration from './components/TallyIntegration';
import ImportWizard     from './components/ImportWizard';
import Reports          from './components/Reports';
import ActivityLogs     from './components/ActivityLogs';
import Billing          from './components/Billing';
import ProfilePage      from './components/ProfilePage';
import api              from './services/api';
import { companies as companiesApi } from './services/api';

/* ── Theme Toggle ─────────────────────────────────────────── */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      className={`theme-toggle ${isDark ? 'is-dark' : 'is-light'}`}
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light' : 'Switch to Dark'}
      aria-label="Toggle theme"
    >
      <span className="toggle-icon toggle-sun">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </span>
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-icon toggle-moon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </span>
    </button>
  );
}

/* ── App Shell ───────────────────────────────────────────── */
function AppShell() {
  const { user, logout }         = useAuth();
  const { clearAll, addOrUpdateCompany, mergeCompanies } = useAppState();

  const [activeMenu,        setActiveMenu]        = useState('dashboard');
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false);

  // companies list from DB (id + name + connected_at, no masters)
  const [dbCompanies,      setDbCompanies]       = useState([]);
  // Set of company IDs that are synced (have masters) this session
  const [activeCompanyIds, setActiveCompanyIds]  = useState(new Set());
  // Full companies with masters (for Settings, InvoiceMapping dropdowns)
  const [syncedCompanies,  setSyncedCompanies]   = useState([]);

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard'     },
    { id: 'companies', icon: '🏢', label: 'Companies'     },
    { id: 'tally',     icon: '🔌', label: 'Tally Connect' },
    { id: 'invoices',  icon: '📄', label: 'Invoices'      },
    { id: 'import',    icon: '📤', label: 'Import Wizard' },
    { id: 'reports',   icon: '📈', label: 'Reports'       },
    { id: 'activity',  icon: '📋', label: 'Activity Logs' },
    { id: 'billing',   icon: '💳', label: 'Billing'       },
    { id: 'settings',  icon: '⚙️', label: 'Settings'      },
    { id: 'profile',   icon: '👤', label: 'My Profile'    },
  ];

  // ── Load DB companies list on login ───────────────────────────
  // This only gets id + name + connected_at (no masters — those need live Tally connect)
  const loadDbCompanies = async () => {
    try {
      const res  = await companiesApi.list();
      const list = res.data?.companies || [];
      setDbCompanies(list);
      // Merge into AppState context (for Dashboard KPIs)
      mergeCompanies(list);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  };

  useEffect(() => {
    if (user) loadDbCompanies();
    else {
      // On logout — clear active session data
      setDbCompanies([]);
      setActiveCompanyIds(new Set());
      setSyncedCompanies([]);
    }
  }, [user]);

  // ── Called when a company is successfully connected to Tally ──
  // Adds it to the "active" set and stores its masters
  const handleTallyConnectSuccess = async () => {
    // Reload the DB list so new companies appear
    await loadDbCompanies();
  };

  // ── Called after a fresh connect — data comes from TallyIntegration ──
  // AppStateContext's addOrUpdateCompany is called by TallyIntegration directly.
  // Here we just mark the company as active.
  const markCompanyActive = (companyData) => {
    setActiveCompanyIds((prev) => new Set([...prev, companyData.id]));
    setSyncedCompanies((prev) => {
      const idx = prev.findIndex((c) => c.id === companyData.id);
      if (idx !== -1) {
        const arr = [...prev]; arr[idx] = companyData; return arr;
      }
      return [...prev, companyData];
    });
  };

  // ── Re-sync a company from Companies page ─────────────────────
  const handleReconnect = async (company_name) => {
    const res  = await companiesApi.connect(company_name);
    const data = res.data;
    addOrUpdateCompany(data);
    markCompanyActive(data);
    await loadDbCompanies();
  };

  // Merge DB list with synced masters for full company objects
  const mergedCompanies = dbCompanies.map((db) => {
    const synced = syncedCompanies.find((s) => s.id === db.id);
    return synced ? { ...db, ...synced } : db;
  });

  const handleLogout = () => { clearAll(); logout(); };

  const renderPage = () => {
    switch (activeMenu) {
      case 'dashboard': return <Dashboard setActiveMenu={setActiveMenu} />;
      case 'companies': return (
        <Companies
          companies={mergedCompanies}
          activeCompanyIds={activeCompanyIds}
          onReconnect={handleReconnect}
          setActiveMenu={setActiveMenu}
        />
      );
      case 'tally': return (
        <TallyIntegration
          setActiveMenu={setActiveMenu}
          onSuccess={handleTallyConnectSuccess}
        />
      );
      case 'invoices':  return <InvoiceMapping />;
      case 'import':    return <ImportWizard />;
      case 'reports':   return <Reports />;
      case 'activity':  return <ActivityLogs />;
      case 'billing':   return <Billing />;
      case 'settings':  return <Settings companies={mergedCompanies} setActiveMenu={setActiveMenu} />;
      case 'profile':   return <ProfilePage />;
      default:          return <Dashboard setActiveMenu={setActiveMenu} />;
    }
  };

  return (
    <div className="app">
      {!user && <AuthModal />}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            {!sidebarCollapsed && (
              <div>
                <span className="logo-text">EInvoice Pro</span>
                <span className="logo-sub">Tally Integration</span>
              </div>
            )}
          </div>
          <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeMenu === item.id ? 'active' : ''}`}
              onClick={() => setActiveMenu(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar"
              style={{ cursor: 'pointer' }}
              onClick={() => user && setActiveMenu('profile')}
              title={user ? 'View Profile' : ''}
            >
              {user?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            {!sidebarCollapsed && (
              <div className="user-details">
                <div className="user-name"
                  style={{ cursor: user ? 'pointer' : 'default' }}
                  onClick={() => user && setActiveMenu('profile')}
                >
                  {user ? (user.first_name || user.email?.split('@')[0]) : 'Not signed in'}
                </div>
                {user
                  ? <button className="logout-btn" onClick={handleLogout}>Logout</button>
                  : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Click to sign in</span>
                }
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <header className="top-bar">
          <h1 className="page-title">
            {menuItems.find((i) => i.id === activeMenu)?.label}
          </h1>
          <div className="top-bar-actions">
            <ThemeToggle />
            {user
              ? <button className="btn btn-primary" onClick={() => setActiveMenu('invoices')}>+ Upload Invoice</button>
              : <button className="btn btn-primary" onClick={() => {}}>Sign In to Continue</button>
            }
          </div>
        </header>

        <div className="content">{renderPage()}</div>
      </main>
    </div>
  );
}

/* ── Root ────────────────────────────────────────────────── */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppStateProvider>
          <AppShell />
        </AppStateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}