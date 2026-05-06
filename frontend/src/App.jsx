import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Profile from './pages/Profile';
import TransfersHub from './pages/TransfersHub';
import AccountingHub from './pages/AccountingHub';
import AnalyticsHub from './pages/AnalyticsHub';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuthStore();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading, checkAuth } = useAuthStore();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    checkAuth();
  }, []);

  // Sync dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-primary">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-brand-600/20 border-t-brand-600 rounded-full mx-auto" />
          <p className="text-sm text-content-muted mt-4">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />

        {/* ── Transfers hub ── */}
        <Route path="transfers" element={<PrivateRoute roles={['ADMIN','OFFICE','COUNTRY','CITY']}><TransfersHub /></PrivateRoute>} />
        <Route path="acceptance"   element={<Navigate to="/transfers?tab=incoming"    replace />} />
        <Route path="problematic"  element={<Navigate to="/transfers?tab=problematic" replace />} />
        <Route path="pending"      element={<Navigate to="/transfers?tab=pending"     replace />} />

        {/* ── Accounting hub ── */}
        <Route path="accounting"    element={<PrivateRoute roles={['ADMIN','OFFICE','COUNTRY','CITY']}><AccountingHub /></PrivateRoute>} />
        <Route path="balance"       element={<Navigate to="/accounting"               replace />} />
        <Route path="expenses"      element={<Navigate to="/accounting?tab=expenses"  replace />} />
        <Route path="company-losses" element={<Navigate to="/accounting?tab=losses"   replace />} />

        {/* ── Analytics hub ── */}
        <Route path="analytics"  element={<PrivateRoute roles={['ADMIN','OFFICE','COUNTRY','CITY']}><AnalyticsHub /></PrivateRoute>} />
        <Route path="statistics" element={<Navigate to="/analytics"             replace />} />
        <Route path="history"    element={<Navigate to="/analytics?tab=history" replace />} />
        <Route path="map"        element={<Navigate to="/analytics?tab=map"     replace />} />

        {/* ── Standalone pages ── */}
        <Route path="users"   element={<PrivateRoute roles={['ADMIN','OFFICE']}><Users /></PrivateRoute>} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}