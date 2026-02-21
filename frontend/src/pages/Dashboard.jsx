import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { BraceletRow } from '../components/ui/BraceletBadge';
import {
  Send, PackageCheck, Globe, MapPin,
  ArrowRight, Package, Clock, Activity,
  CalendarDays, Boxes, Map as MapIcon,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [pending, setPending] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const promises = [
        transfersApi.getAll(),
        transfersApi.getPending(),
        usersApi.getCountries(),
      ];

      if (user.role !== 'ADMIN') {
        const entityType = user.role === 'COUNTRY' ? 'COUNTRY' : 'CITY';
        const entityId = user.role === 'COUNTRY' ? user.countryId : user.cityId;
        promises.push(inventoryApi.getBalance(entityType, entityId));
      }

      const results = await Promise.all(promises);

      // All transfers
      const allData = results[0].data;
      const allTransfers = Array.isArray(allData) ? allData : [];
      setTransfers(allTransfers);

      // Pending incoming
      const pendData = results[1].data;
      setPending(Array.isArray(pendData) ? pendData : []);

      // Countries & cities count
      const countriesData = results[2].data;
      const countriesList = Array.isArray(countriesData) ? countriesData : [];
      const totalCities = countriesList.reduce((sum, c) => sum + (c.cities?.length || 0), 0);
      setStats({ countries: countriesList.length, cities: totalCities });

      // Balance (non-admin)
      if (results[3]) {
        const d = results[3].data;
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          setBalance(Object.entries(d).map(([itemType, quantity]) => ({ itemType, quantity })));
        } else {
          setBalance(Array.isArray(d) ? d : []);
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const entityLabel =
    user.role === 'ADMIN' ? 'Администратор' :
    user.role === 'COUNTRY' ? user.country?.name || 'Страна' :
    user.city?.name || 'Город';

  const totalBracelets = transfers.reduce((sum, t) =>
    sum + (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0), 0);

  const statusCounts = {};
  transfers.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  const recentTransfers = [...transfers]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const quickActions = [
    { label: 'Новая отправка', icon: Send, path: '/transfers', color: 'bg-blue-500', roles: ['ADMIN', 'COUNTRY'] },
    { label: 'Приёмка', icon: PackageCheck, path: '/acceptance', color: 'bg-green-500', roles: ['ADMIN', 'COUNTRY', 'CITY'] },
    { label: 'Мероприятия', icon: CalendarDays, path: '/expenses', color: 'bg-purple-500', roles: ['CITY', 'COUNTRY'] },
    { label: 'Остатки', icon: Boxes, path: '/inventory', color: 'bg-amber-500', roles: ['ADMIN', 'COUNTRY', 'CITY'] },
    { label: 'Карта', icon: MapIcon, path: '/map', color: 'bg-teal-500', roles: ['ADMIN', 'COUNTRY', 'CITY'] },
    { label: 'История', icon: Clock, path: '/history', color: 'bg-slate-500', roles: ['ADMIN', 'COUNTRY', 'CITY'] },
  ].filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-6">
      {/* ── Gradient Header ──────────────────────────── */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Привет, {user.displayName}!
            </h1>
            <p className="text-brand-100 mt-1 text-sm flex items-center gap-1.5">
              {user.role === 'ADMIN' ? <Globe size={14} /> : <MapPin size={14} />}
              {entityLabel}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
            <Activity size={22} className="text-brand-200" />
            <div>
              <div className="text-xl font-bold">{transfers.length}</div>
              <div className="text-[11px] text-brand-200 leading-tight">трансферов</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: transfers.length, label: 'Отправки', icon: Send, iconColor: 'text-blue-500', bg: 'bg-blue-50' },
          { value: totalBracelets, label: 'Браслетов', icon: Package, iconColor: 'text-emerald-500', bg: 'bg-emerald-50' },
          { value: stats.countries, label: 'Стран', icon: Globe, iconColor: 'text-violet-500', bg: 'bg-violet-50' },
          { value: stats.cities, label: 'Городов', icon: MapPin, iconColor: 'text-amber-500', bg: 'bg-amber-50' },
        ].map(({ value, label, icon: Icon, iconColor, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={iconColor} />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">{value}</div>
                <div className="text-xs text-gray-400">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Balance (non-admin) ──────────────────────── */}
      {balance && balance.length > 0 && (
        <Card
          title="Текущий остаток"
          action={
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              Подробнее <ArrowRight size={12} />
            </button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
              const qty = balance.find((b) => b.itemType === type)?.quantity || 0;
              const colors = {
                BLACK: 'bg-gray-900 text-white',
                WHITE: 'bg-white border-2 border-gray-200 text-gray-800',
                RED: 'bg-red-500 text-white',
                BLUE: 'bg-blue-500 text-white',
              };
              const labels = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
              return (
                <div key={type} className={`rounded-xl p-3 text-center ${colors[type]} shadow-sm`}>
                  <div className="text-2xl font-bold">{qty}</div>
                  <div className="text-xs mt-0.5 opacity-80">{labels[type]}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Pending Incoming ─────────────────────────── */}
      {pending.length > 0 && (
        <div className="bg-yellow-50/60 rounded-xl border border-yellow-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-yellow-100">
            <h3 className="font-semibold text-yellow-800 flex items-center gap-2">
              <PackageCheck size={16} />
              Ожидают приёмки ({pending.length})
            </h3>
            <button
              onClick={() => navigate('/acceptance')}
              className="text-xs text-yellow-700 hover:text-yellow-800 flex items-center gap-1 font-medium"
            >
              Открыть <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {pending.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-100"
              >
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    От: {t.senderType === 'ADMIN'
                      ? 'Админ'
                      : (t.senderCity?.name || t.senderCountry?.name || 'Отправитель')}
                  </div>
                  <div className="mt-1">
                    <BraceletRow items={t.items} size="sm" />
                  </div>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
            {pending.length > 3 && (
              <button
                onClick={() => navigate('/acceptance')}
                className="w-full text-center text-xs text-yellow-700 hover:text-yellow-800 py-2"
              >
                Ещё {pending.length - 3} отправок →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Быстрые действия
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="group bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div
                className={`w-10 h-10 ${action.color} rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                <action.icon size={20} className="text-white" />
              </div>
              <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                {action.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Status Breakdown + Recent ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <Card title="Статусы отправок">
          {transfers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>
          ) : (
            <div className="space-y-2.5">
              {[
                { key: 'SENT', label: 'Отправлено', color: 'bg-yellow-400' },
                { key: 'ACCEPTED', label: 'Принято', color: 'bg-green-400' },
                { key: 'DISCREPANCY_FOUND', label: 'Расхождение', color: 'bg-orange-400' },
                { key: 'REJECTED', label: 'Отклонено', color: 'bg-red-400' },
                { key: 'CANCELLED', label: 'Отменено', color: 'bg-gray-300' },
              ].map(({ key, label, color }) => {
                const count = statusCounts[key] || 0;
                const pct = transfers.length > 0
                  ? Math.round((count / transfers.length) * 100)
                  : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                    <span className="text-sm text-gray-600 flex-1">{label}</span>
                    <span className="text-sm font-semibold text-gray-800 w-6 text-right">
                      {count}
                    </span>
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent transfers */}
        <Card
          title="Последние отправки"
          action={
            <button
              onClick={() => navigate('/history')}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              Все <ArrowRight size={12} />
            </button>
          }
        >
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет отправок</p>
          ) : (
            <div className="space-y-1">
              {recentTransfers.map((t) => {
                const from =
                  t.senderType === 'ADMIN'
                    ? 'Админ'
                    : (t.senderCity?.name || t.senderCountry?.name || '—');
                const to = t.receiverCity?.name || t.receiverCountry?.name || '—';
                const totalQty = (t.items || []).reduce(
                  (s, i) => s + (i.quantity || 0),
                  0,
                );
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700 truncate">
                        {from} → {to}
                      </div>
                      <div className="text-xs text-gray-400">{totalQty} шт</div>
                    </div>
                    <Badge status={t.status} />
                    <span className="text-[10px] text-gray-300 flex-shrink-0">
                      {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
