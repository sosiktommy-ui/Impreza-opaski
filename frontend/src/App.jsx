import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transfers from './pages/Transfers';
import Acceptance from './pages/Acceptance';
import Expenses from './pages/Expenses';
import Inventory from './pages/Inventory';
import Users from './pages/Users';
import History from './pages/History';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuthStore();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full mx-auto" />
          <p className="text-sm text-gray-400 mt-4">Загрузка...</p>
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

        <Route
          path="transfers"
          element={
            <PrivateRoute roles={['ADMIN', 'COUNTRY']}>
              <Transfers />
            </PrivateRoute>
          }
        />

        <Route
          path="acceptance"
          element={
            <PrivateRoute roles={['COUNTRY', 'CITY']}>
              <Acceptance />
            </PrivateRoute>
          }
        />

        <Route path="expenses" element={<Expenses />} />
        <Route path="inventory" element={<Inventory />} />

        <Route
          path="users"
          element={
            <PrivateRoute roles={['ADMIN']}>
              <Users />
            </PrivateRoute>
          }
        />

        <Route path="history" element={<History />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
