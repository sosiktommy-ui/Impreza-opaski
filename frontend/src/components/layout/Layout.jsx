import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="h-dvh flex flex-col bg-surface-primary">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface-primary p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
