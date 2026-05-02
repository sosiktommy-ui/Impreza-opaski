import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function AppShell() {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
