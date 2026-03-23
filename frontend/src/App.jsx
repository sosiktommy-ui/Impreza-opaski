import { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { useFilterStore } from './store/useAppStore';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transfers from './pages/Transfers';
import Acceptance from './pages/Acceptance';
import Expenses from './pages/Expenses';
import Inventory from './pages/Inventory';
import Users from './pages/Users';
import History from './pages/History';
import ProblematicTransfers from './pages/ProblematicTransfers';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import Map from './pages/Map';
import { transfersApi } from './api/transfers';
import { eventsApi } from './api/events';
import { usersApi } from './api/users';
import {
  Clock, AlertTriangle, Package, TrendingDown, TrendingUp,
  ArrowRightLeft, Calendar, Filter, RefreshCw, Download,
  BarChart3, PieChart, Activity, Users as UsersIcon, MapPin
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
  LineChart, Line, Legend, Area, AreaChart
} from 'recharts';
import Skeleton from './components/ui/Skeleton';
import BraceletBadge from './components/ui/BraceletBadge';

// ============ PENDING TRANSFERS PAGE ============
function PendingTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { countryId, cityId } = useFilterStore();

  useEffect(() => {
    loadPendingTransfers();
  }, [countryId, cityId]);

  const loadPendingTransfers = async () => {
    setLoading(true);
    try {
      const params = { status: 'PENDING' };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      const { data } = await transfersApi.getAll(params);
      setTransfers(data.data || data || []);
    } catch (err) {
      setError('Не удалось загрузить зависшие переводы');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPendingDuration = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (diffDays > 0) return `${diffDays}д ${diffHours}ч`;
    return `${diffHours}ч`;
  };

  const getSeverityColor = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now - created) / (1000 * 60 * 60);
    if (diffHours > 72) return 'border-red-500/50 bg-red-500/5';
    if (diffHours > 24) return 'border-amber-500/50 bg-amber-500/5';
    return 'border-edge bg-surface-card';
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-content-primary">Зависшие переводы</h1>
            <p className="text-sm text-content-muted">Переводы в ожидании более 24 часов</p>
          </div>
        </div>
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-content-primary">Зависшие переводы</h1>
            <p className="text-sm text-content-muted">
              {transfers.length} переводов в ожидании
            </p>
          </div>
        </div>
        <button
          onClick={loadPendingTransfers}
          className="p-2 rounded-lg hover:bg-surface-card-hover transition-colors"
        >
          <RefreshCw size={18} className="text-content-muted" />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Нет зависших переводов</h3>
          <p className="text-sm text-content-muted">Все переводы обработаны вовремя</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {transfers.map((transfer) => (
            <div
              key={transfer.id}
              className={`p-4 rounded-xl border transition-all ${getSeverityColor(transfer.createdAt)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono bg-surface-primary px-2 py-0.5 rounded text-content-muted">
                      #{transfer.id?.slice(-8)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">
                      Ожидает {getPendingDuration(transfer.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm mb-3">
                    <span className="font-medium text-content-primary">
                      {transfer.sender?.city?.name || transfer.senderCity?.name || 'Отправитель'}
                    </span>
                    <ArrowRightLeft size={14} className="text-content-muted" />
                    <span className="font-medium text-content-primary">
                      {transfer.receiver?.city?.name || transfer.receiverCity?.name || 'Получатель'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                      const count = transfer[type.toLowerCase()] || transfer[`${type.toLowerCase()}Count`] || 0;
                      if (count <= 0) return null;
                      return <BraceletBadge key={type} type={type} count={count} />;
                    })}
                  </div>

                  {transfer.event?.name && (
                    <div className="mt-2 text-xs text-content-muted flex items-center gap-1">
                      <Calendar size={12} />
                      {transfer.event.name}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-xs text-content-muted">
                    {new Date(transfer.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="text-xs text-content-muted">
                    {new Date(transfer.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ STATISTICS PAGE ============
const BRACELET_COLORS = {
  BLACK: '#1f2937',
  WHITE: '#e5e7eb',
  RED: '#ef4444',
  BLUE: '#3b82f6',
};

function Statistics() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [transferStats, setTransferStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [eventStats, setEventStats] = useState(null);
  const { countryId, cityId, eventId } = useFilterStore();

  useEffect(() => {
    loadAllStats();
  }, [dateRange, countryId, cityId, eventId]);

  const loadAllStats = async () => {
    setLoading(true);
    try {
      const params = { period: dateRange };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      if (eventId) params.eventId = eventId;

      const [transfersRes, usersRes, eventsRes] = await Promise.all([
        transfersApi.getAll({ limit: 1000, ...params }).catch(() => ({ data: [] })),
        usersApi.getUsers().catch(() => ({ data: [] })),
        eventsApi.getAll().catch(() => ({ data: [] })),
      ]);

      // Process transfer statistics
      const transfers = transfersRes.data?.data || transfersRes.data || [];
      const now = new Date();
      let startDate = new Date();
      
      if (dateRange === 'week') startDate.setDate(now.getDate() - 7);
      else if (dateRange === 'month') startDate.setMonth(now.getMonth() - 1);
      else if (dateRange === 'quarter') startDate.setMonth(now.getMonth() - 3);
      else if (dateRange === 'year') startDate.setFullYear(now.getFullYear() - 1);

      const filteredTransfers = transfers.filter(t => new Date(t.createdAt) >= startDate);
      
      const byStatus = filteredTransfers.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});

      const byType = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      filteredTransfers.forEach(t => {
        byType.BLACK += t.black || t.blackCount || 0;
        byType.WHITE += t.white || t.whiteCount || 0;
        byType.RED += t.red || t.redCount || 0;
        byType.BLUE += t.blue || t.blueCount || 0;
      });

      // Group by day for trend chart
      const byDay = {};
      filteredTransfers.forEach(t => {
        const day = new Date(t.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        if (!byDay[day]) byDay[day] = { sent: 0, received: 0, problematic: 0 };
        if (t.status === 'DELIVERED') byDay[day].received++;
        else if (t.status === 'DISCREPANCY') byDay[day].problematic++;
        else byDay[day].sent++;
      });

      const dailyTrend = Object.entries(byDay)
        .sort(([a], [b]) => {
          const [dayA, monthA] = a.split('.').map(Number);
          const [dayB, monthB] = b.split('.').map(Number);
          return monthA - monthB || dayA - dayB;
        })
        .slice(-14)
        .map(([date, data]) => ({ date, ...data }));

      setTransferStats({
        total: filteredTransfers.length,
        byStatus,
        byType,
        dailyTrend,
        totalBracelets: Object.values(byType).reduce((a, b) => a + b, 0),
      });

      // Process user statistics
      const users = usersRes.data?.data || usersRes.data || [];
      const byRole = users.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      }, {});
      
      setUserStats({
        total: users.length,
        byRole,
        active: users.filter(u => u.active !== false).length,
      });

      // Process event statistics
      const events = eventsRes.data?.data || eventsRes.data || [];
      const activeEvents = events.filter(e => e.active !== false);
      
      setEventStats({
        total: events.length,
        active: activeEvents.length,
        byCountry: events.reduce((acc, e) => {
          const country = e.country?.name || 'Неизвестно';
          acc[country] = (acc[country] || 0) + 1;
          return acc;
        }, {}),
      });

    } catch (err) {
      console.error('Failed to load statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusPieData = useMemo(() => {
    if (!transferStats?.byStatus) return [];
    const statusLabels = {
      PENDING: 'Ожидание',
      IN_TRANSIT: 'В пути',
      DELIVERED: 'Доставлено',
      DISCREPANCY: 'Расхождение',
    };
    const statusColors = {
      PENDING: '#f59e0b',
      IN_TRANSIT: '#3b82f6',
      DELIVERED: '#10b981',
      DISCREPANCY: '#ef4444',
    };
    return Object.entries(transferStats.byStatus).map(([status, count]) => ({
      name: statusLabels[status] || status,
      value: count,
      color: statusColors[status] || '#6b7280',
    }));
  }, [transferStats]);

  const braceletBarData = useMemo(() => {
    if (!transferStats?.byType) return [];
    return [
      { name: 'Чёрный', value: transferStats.byType.BLACK, fill: BRACELET_COLORS.BLACK },
      { name: 'Белый', value: transferStats.byType.WHITE, fill: BRACELET_COLORS.WHITE },
      { name: 'Красный', value: transferStats.byType.RED, fill: BRACELET_COLORS.RED },
      { name: 'Синий', value: transferStats.byType.BLUE, fill: BRACELET_COLORS.BLUE },
    ];
  }, [transferStats]);

  const rolePieData = useMemo(() => {
    if (!userStats?.byRole) return [];
    const roleLabels = { ADMIN: 'Админы', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };
    const roleColors = { ADMIN: '#8b5cf6', OFFICE: '#3b82f6', COUNTRY: '#10b981', CITY: '#f59e0b' };
    return Object.entries(userStats.byRole).map(([role, count]) => ({
      name: roleLabels[role] || role,
      value: count,
      color: roleColors[role] || '#6b7280',
    }));
  }, [userStats]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-brand-500" />
          </div>
          <h1 className="text-xl font-bold text-content-primary">Статистика</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-content-primary">Статистика</h1>
            <p className="text-sm text-content-muted">Аналитика и отчётность</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {['week', 'month', 'quarter', 'year'].map((period) => (
            <button
              key={period}
              onClick={() => setDateRange(period)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                dateRange === period
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-card hover:bg-surface-card-hover text-content-secondary'
              }`}
            >
              {period === 'week' && 'Неделя'}
              {period === 'month' && 'Месяц'}
              {period === 'quarter' && 'Квартал'}
              {period === 'year' && 'Год'}
            </button>
          ))}
          <button
            onClick={loadAllStats}
            className="p-2 rounded-lg hover:bg-surface-card-hover transition-colors ml-2"
          >
            <RefreshCw size={18} className="text-content-muted" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <ArrowRightLeft size={16} className="text-blue-500" />
            </div>
            <span className="text-sm text-content-muted">Переводы</span>
          </div>
          <div className="text-2xl font-bold text-content-primary">{transferStats?.total || 0}</div>
          <div className="text-xs text-content-muted mt-1">за период</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package size={16} className="text-emerald-500" />
            </div>
            <span className="text-sm text-content-muted">Браслеты</span>
          </div>
          <div className="text-2xl font-bold text-content-primary">{transferStats?.totalBracelets || 0}</div>
          <div className="text-xs text-content-muted mt-1">перемещено</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <UsersIcon size={16} className="text-purple-500" />
            </div>
            <span className="text-sm text-content-muted">Пользователи</span>
          </div>
          <div className="text-2xl font-bold text-content-primary">{userStats?.total || 0}</div>
          <div className="text-xs text-content-muted mt-1">{userStats?.active || 0} активных</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Calendar size={16} className="text-amber-500" />
            </div>
            <span className="text-sm text-content-muted">Мероприятия</span>
          </div>
          <div className="text-2xl font-bold text-content-primary">{eventStats?.total || 0}</div>
          <div className="text-xs text-content-muted mt-1">{eventStats?.active || 0} активных</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Transfer Trend */}
        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
            <Activity size={16} className="text-brand-500" />
            Динамика переводов
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={transferStats?.dailyTrend || []}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-card)', 
                    border: '1px solid var(--edge)',
                    borderRadius: '8px',
                    color: 'var(--content-primary)'
                  }} 
                />
                <Area type="monotone" dataKey="sent" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSent)" name="Отправлено" />
                <Area type="monotone" dataKey="received" stroke="#10b981" fillOpacity={1} fill="url(#colorReceived)" name="Доставлено" />
                <Line type="monotone" dataKey="problematic" stroke="#ef4444" name="Проблемные" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pie Chart */}
        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
            <PieChart size={16} className="text-brand-500" />
            Статусы переводов
          </h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-card)', 
                    border: '1px solid var(--edge)',
                    borderRadius: '8px'
                  }} 
                />
                <Legend 
                  formatter={(value) => <span style={{ color: 'var(--content-secondary)' }}>{value}</span>}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bracelet Distribution */}
        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
            <Package size={16} className="text-brand-500" />
            Распределение браслетов
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={braceletBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" />
                <XAxis type="number" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} width={80} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-card)', 
                    border: '1px solid var(--edge)',
                    borderRadius: '8px'
                  }} 
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {braceletBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Roles Distribution */}
        <div className="p-4 rounded-xl bg-surface-card border border-edge">
          <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
            <UsersIcon size={16} className="text-brand-500" />
            Пользователи по ролям
          </h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={rolePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {rolePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-card)', 
                    border: '1px solid var(--edge)',
                    borderRadius: '8px'
                  }} 
                />
                <Legend 
                  formatter={(value) => <span style={{ color: 'var(--content-secondary)' }}>{value}</span>}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Stats Table */}
      <div className="p-4 rounded-xl bg-surface-card border border-edge">
        <h3 className="text-sm font-semibold text-content-primary mb-4">Сводка по браслетам</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(transferStats?.byType || {}).map(([type, count]) => (
            <div key={type} className="p-3 rounded-lg bg-surface-primary">
              <div className="flex items-center gap-2 mb-1">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: BRACELET_COLORS[type] }}
                />
                <span className="text-xs text-content-muted">
                  {type === 'BLACK' && 'Чёрные'}
                  {type === 'WHITE' && 'Белые'}
                  {type === 'RED' && 'Красные'}
                  {type === 'BLUE' && 'Синие'}
                </span>
              </div>
              <div className="text-xl font-bold text-content-primary">{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

        <Route
          path="transfers"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <Transfers />
            </PrivateRoute>
          }
        />

        <Route
          path="acceptance"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <Acceptance />
            </PrivateRoute>
          }
        />

        <Route
          path="problematic"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE']}>
              <ProblematicTransfers />
            </PrivateRoute>
          }
        />

        <Route
          path="pending"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <PendingTransfers />
            </PrivateRoute>
          }
        />

        <Route
          path="statistics"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <Statistics />
            </PrivateRoute>
          }
        />

        <Route
          path="expenses"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <Expenses />
            </PrivateRoute>
          }
        />
        <Route
          path="inventory"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <Inventory />
            </PrivateRoute>
          }
        />

        <Route
          path="users"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE']}>
              <Users />
            </PrivateRoute>
          }
        />

        <Route
          path="history"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY', 'CITY']}>
              <History />
            </PrivateRoute>
          }
        />

        <Route path="profile" element={<Profile />} />
        <Route path="chat" element={<Chat />} />
        <Route
          path="map"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE', 'COUNTRY']}>
              <Map />
            </PrivateRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
