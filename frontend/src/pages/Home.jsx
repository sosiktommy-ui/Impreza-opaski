import Header from '../components/layout/Header';
import { useAuthStore } from '../store/useAuthStore';

export default function Home() {
  const { user, currentAccess } = useAuthStore();

  return (
    <>
      <Header
        title={`Здравствуйте, ${user?.displayName?.split(' ')[0] || user?.username || ''}`}
        subtitle="Сводка вашего контекста"
      />
      <div className="p-6 md:p-8 fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Stat label="Контекст" value={currentAccess?.scope || '—'} hint={currentAccess?.cityName || currentAccess?.countryName || ''} />
          <Stat label="Роль" value={user?.role || '—'} />
          <Stat label="Логин" value={user?.username || '—'} />
        </div>

        <div className="card p-6 mt-6">
          <h2 className="text-[15px] font-semibold mb-1">Добро пожаловать в Impreza</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Это рабочий стол. Слева — навигация по разделам. Дальше будут наполнены модули склада, передач, расходов и истории.
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="card p-5">
      <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">{label}</div>
      <div className="text-[22px] font-semibold mt-1.5 tracking-tight">{value}</div>
      {hint && <div className="text-text-3 text-xs mt-1 mono">{hint}</div>}
    </div>
  );
}
