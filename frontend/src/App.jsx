// src/App.jsx
import React, { useState } from 'react';
import './App.css';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Dashboard        from './components/Dashboard';
import Companies        from './components/Companies';
import InvoiceMapping   from './components/InvoiceMapping';
import Settings         from './components/Settings';
import TallyIntegration from './components/TallyIntegration';
import ImportWizard     from './components/ImportWizard';
import Reports          from './components/Reports';
import ActivityLogs     from './components/ActivityLogs';
import Billing          from './components/Billing';

// ── Theme Toggle ─────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      className={`theme-toggle ${isDark ? 'is-dark' : 'is-light'}`}
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
      aria-label="Toggle theme"
    >
      {/* Sun icon */}
      <span className="toggle-icon toggle-sun">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1"  x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1"  y1="12" x2="3"  y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </span>

      {/* Sliding pill track */}
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>

      {/* Moon icon */}
      <span className="toggle-icon toggle-moon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </span>
    </button>
  );
}

// ── Inner App ────────────────────────────────────────────────
function AppInner() {
  const [activeMenu, setActiveMenu]             = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companies, setCompanies]               = useState([]);

  const addCompany = (mastersPayload) => {
    setCompanies((prev) => {
      const exists = prev.find((c) => c.company_name === mastersPayload.company_name);
      if (exists) return prev;
      return [
        ...prev,
        {
          id:           Date.now(),
          company_name: mastersPayload.company_name,
          connected_at: new Date().toISOString(),
          ledgers:      mastersPayload.ledgers     || [],
          stock_items:  mastersPayload.stock_items || [],
          units:        mastersPayload.units       || [],
        },
      ];
    });
  };

  const removeCompany = (id) =>
    setCompanies((prev) => prev.filter((c) => c.id !== id));

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard'     },
    { id: 'companies', icon: '🏢', label: 'Companies'     },
    { id: 'tally',     icon: '🔌', label: 'Tally Connect' },
    { id: 'invoices',  icon: '📄', label: 'Invoices'      },
    { id: 'import',    icon: '📤', label: 'Import Wizard' },
    { id: 'reports',   icon: '📈', label: 'Reports'       },
    { id: 'activity',  icon: '📋', label: 'Activity Logs' },
    { id: 'billing',   icon: '💳', label: 'Billing'       },
    { id: 'settings',  icon: '⚙️', label: 'Settings'     },
  ];

  const renderPage = () => {
    const props = { companies, addCompany, removeCompany, setActiveMenu };
    switch (activeMenu) {
      case 'dashboard': return <Dashboard         {...props} />;
      case 'companies': return <Companies         {...props} />;
      case 'tally':     return <TallyIntegration  {...props} />;
      case 'invoices':  return <InvoiceMapping    {...props} />;
      case 'import':    return <ImportWizard />;
      case 'reports':   return <Reports />;
      case 'activity':  return <ActivityLogs />;
      case 'billing':   return <Billing />;
      case 'settings':  return <Settings companies={companies} />;
      default:          return <Dashboard {...props} />;
    }
  };

  return (
    <div className="app">
      {/* ── Sidebar ─────────────────────────────────────────── */}
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
          <button
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
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
              {!sidebarCollapsed && (
                <span className="nav-label">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">A</div>
            {!sidebarCollapsed && (
              <div className="user-details">
                <div className="user-name">Admin</div>
                <div className="user-role">Administrator</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="main">
        <header className="top-bar">
          <h1 className="page-title">
            {menuItems.find((i) => i.id === activeMenu)?.label}
          </h1>
          <div className="top-bar-actions">
            <ThemeToggle />
            <button
              className="btn btn-primary"
              onClick={() => setActiveMenu('invoices')}
            >
              + Upload Invoice
            </button>
          </div>
        </header>

        <div className="content">{renderPage()}</div>
      </main>
    </div>
  );
}

// ── Root: wraps everything in ThemeProvider ──────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}