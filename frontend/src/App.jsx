import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import SelectScope from './pages/SelectScope';
import AppShell from './components/layout/AppShell';
import Home from './pages/Home';
import Inventory from './pages/Inventory';
import Transfers from './pages/Transfers';
import Expenses from './pages/Expenses';
import History from './pages/History';
import Users from './pages/Users';
import Settings from './pages/Settings';
import { useAuthStore } from './store/useAuthStore';

function RequireAuth({ children }) {
  const { sessionToken } = useAuthStore();
  const location = useLocation();
  if (!sessionToken) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/select-scope" element={<SelectScope />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="history" element={<History />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
