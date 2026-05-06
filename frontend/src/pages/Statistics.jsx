import { useState, useEffect, useMemo } from 'react';
import {
  Clock, AlertTriangle, Package, TrendingDown, TrendingUp,
  RefreshCw, BarChart3, PieChart, Activity, Users as UsersIcon,
  CheckCircle, XCircle, Globe, Building2, Timer, Gauge, ArrowRightLeft, Trophy,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
} from 'recharts';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import Skeleton from '../components/ui/Skeleton';

export default function Statistics() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [stats, setStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [expensesRaw, setExpensesRaw] = useState([]);
  const { countryId, cityId, eventId } = useFilterStore();
  const { user } = useAuthStore();
  const isAdminOrOffice = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const isCity = user?.role === 'CITY';
  const isCountry = user?.role === 'COUNTRY';

  useEffect(() => { loadAllStats(); }, [dateRange, countryId, cityId, eventId]);

  const loadAllStats = async () => {
    setLoading(true);
    try {
      const params = { period: dateRange };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      if (eventId) params.eventId = eventId;
      const [statsRes, usersRes, expensesRes] = await Promise.all([
        transfersApi.getStats(params).catch(e => { console.error('Stats API error:', e); return { data: null }; }),
        usersApi.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        inventoryApi.getExpenses({ limit: 500, ...(countryId ? { countryId } : {}), ...(cityId ? { cityId } : {}) }).catch(() => ({ data: { data: [] } })),
      ]);
      const data = statsRes?.data?.data || statsRes?.data || null;
      setStats(data);
      const expList = expensesRes?.data?.data || expensesRes?.data || [];
      setExpensesRaw(Array.isArray(expList) ? expList : []);
      const usersRaw = usersRes?.data;
      const users = usersRaw?.data || (Array.isArray(usersRaw) ? usersRaw : []);
      const userList = Array.isArray(users) ? users : [];
      const byRole = userList.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});
      setUserStats({ total: userList.length || data?.summary?.totalUsers || 0, byRole, active: userList.length > 0 ? userList.filter(u => u.isActive !== false).length : data?.summary?.activeUsers || 0 });
    } catch (err) {
      console.error('Failed to load statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const s = stats?.summary || {};
  const sb = stats?.statusBreakdown || {};
  const bb = stats?.braceletBreakdown || {};

  const dailyTrend = useMemo(() => (stats?.transfersByDay || []).map(t => ({
    date: new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    sent: t.sent || 0, accepted: t.accepted || 0, problematic: t.problematic || 0,
  })), [stats]);

  const expenseDayData = useMemo(() => {
    const byDay = {};
    expensesRaw.forEach(e => {
      const d = new Date(e.eventDate || e.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      if (!byDay[d]) byDay[d] = { date: d, black: 0, white: 0, red: 0, blue: 0 };
      byDay[d].black += e.black || 0; byDay[d].white += e.white || 0; byDay[d].red += e.red || 0; byDay[d].blue += e.blue || 0;
    });
    return Object.values(byDay).sort((a, b) => { const [da,ma] = a.date.split('.').map(Number); const [db,mb] = b.date.split('.').map(Number); return ma !== mb ? ma - mb : da - db; });
  }, [expensesRaw]);

  const topExpenseCities = useMemo(() => {
    const byCity = {};
    expensesRaw.forEach(e => {
      const cityName = e.city?.name || 'Неизвестно';
      if (!byCity[cityName]) byCity[cityName] = { city: cityName, total: 0, black: 0, white: 0, red: 0, blue: 0 };
      byCity[cityName].total += (e.black||0)+(e.white||0)+(e.red||0)+(e.blue||0);
      byCity[cityName].black += e.black||0; byCity[cityName].white += e.white||0; byCity[cityName].red += e.red||0; byCity[cityName].blue += e.blue||0;
    });
    return Object.values(byCity).sort((a,b) => b.total - a.total).slice(0,10);
  }, [expensesRaw]);

  const braceletDayData = useMemo(() => (stats?.transfersByDay||[]).map(t => ({
    date: new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    black: t.black||0, white: t.white||0, red: t.red||0, blue: t.blue||0,
  })), [stats]);

  const statusPieData = useMemo(() => {
    const map = { pending: { name: 'Ожидание', color: '#f59e0b' }, accepted: { name: 'Принято', color: '#10b981' },
      discrepancy: { name: 'Расхождение', color: '#ef4444' }, cancelled: { name: 'Отменено', color: '#6b7280' } };
    return Object.entries(sb).filter(([_,v]) => v > 0).map(([k,v]) => ({ ...(map[k] || { name: k, color: '#6b7280' }), value: v }));
  }, [sb]);

  const colorPieData = useMemo(() => {
    const cd = stats?.colorDistribution || {};
    return [
      { name: 'Чёрный', value: cd.black||0, color: '#1f2937' },
      { name: 'Белый', value: cd.white||0, color: '#9ca3af' },
      { name: 'Красный', value: cd.red||0, color: '#ef4444' },
      { name: 'Синий', value: cd.blue||0, color: '#3b82f6' },
    ].filter(c => c.value > 0);
  }, [stats]);

  const rolePieData = useMemo(() => {
    if (!userStats?.byRole) return [];
    const m = { ADMIN: { name: 'Админы', color: '#8b5cf6' }, OFFICE: { name: 'Офис', color: '#3b82f6' }, COUNTRY: { name: 'Страна', color: '#10b981' }, CITY: { name: 'Город', color: '#f59e0b' } };
    return Object.entries(userStats.byRole).map(([r,v]) => ({ ...(m[r]||{ name: r, color: '#6b7280' }), value: v }));
  }, [userStats]);

  const lossDayData = useMemo(() => (stats?.lossByDay||[]).map(t => ({
    date: new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    black: t.black||0, white: t.white||0, red: t.red||0, blue: t.blue||0,
  })), [stats]);

  const braceletBarData = useMemo(() => [
    { name: 'Чёрный', value: bb.black||0, fill: '#1f2937' },
    { name: 'Белый',  value: bb.white||0, fill: '#e5e7eb' },
    { name: 'Красный',value: bb.red||0,   fill: '#ef4444' },
    { name: 'Синий',  value: bb.blue||0,  fill: '#3b82f6' },
  ], [bb]);

  const tooltipStyle = { backgroundColor: 'var(--surface-card)', border: '1px solid var(--edge)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', color: 'var(--content-primary)' };

  const StatCard = ({ icon: Icon, label, value, subText, gradient, trend, iconColor }) => (
    <div className={`relative overflow-hidden p-5 rounded-2xl border border-edge bg-gradient-to-br ${gradient} hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-300 group`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-110 transition-transform" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-11 h-11 rounded-xl ${iconColor} flex items-center justify-center shadow-lg`}><Icon size={20} className="text-white" /></div>
          {trend !== undefined && trend !== 0 && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trend > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-content-primary mb-1">{value?.toLocaleString?.() || 0}</div>
        <div className="text-sm text-content-muted">{label}</div>
        {subText && <div className="text-xs text-content-muted/70 mt-1">{subText}</div>}
      </div>
    </div>
  );

  if (loading) return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2 justify-end">
        <div className="flex items-center gap-1 bg-surface-card rounded-xl p-1 border border-edge">
          {['week','month','quarter','year'].map(period => (
            <button key={period} onClick={() => setDateRange(period)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === period ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20' : 'hover:bg-surface-card-hover text-content-secondary'}`}>
              {period === 'week' ? 'Неделя' : period === 'month' ? 'Месяц' : period === 'quarter' ? 'Квартал' : 'Год'}
            </button>
          ))}
          <button onClick={loadAllStats} className="p-2 rounded-lg hover:bg-surface-card-hover ml-1" title="Обновить"><RefreshCw size={18} className="text-content-muted" /></button>
        </div>
      </div>

      {/* Key metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ArrowRightLeft} label="Переводы" value={s.totalTransfers} subText="за выбранный период" gradient="from-blue-500/10 to-blue-600/5" iconColor="bg-gradient-to-br from-blue-500 to-blue-600" trend={s.transferChange} />
        <StatCard icon={Package} label="Браслеты в переводах" value={s.totalBracelets} subText="перемещено" gradient="from-emerald-500/10 to-emerald-600/5" iconColor="bg-gradient-to-br from-emerald-500 to-emerald-600" />
        <StatCard icon={TrendingDown} label={isAdminOrOffice ? 'Потери компании' : 'Мои потери'} value={s.totalLoss} subText="за период" gradient="from-red-500/10 to-red-600/5" iconColor="bg-gradient-to-br from-red-500 to-red-600" />
        <StatCard icon={Gauge} label="Создано на складе" value={s.totalCreated} subText="за период" gradient="from-cyan-500/10 to-cyan-600/5" iconColor="bg-gradient-to-br from-cyan-500 to-cyan-600" />
        {isAdminOrOffice && <StatCard icon={UsersIcon} label="Пользователи" value={s.totalUsers} subText={`${s.activeUsers||0} активных`} gradient="from-purple-500/10 to-purple-600/5" iconColor="bg-gradient-to-br from-purple-500 to-purple-600" />}
        <StatCard icon={Building2} label={isCity ? 'Мой город' : 'Активные города'} value={isCity ? 1 : s.activeCities} subText={isCity ? '' : 'с ненулевым балансом'} gradient="from-orange-500/10 to-orange-600/5" iconColor="bg-gradient-to-br from-orange-500 to-orange-600" />
        <StatCard icon={Timer} label="Ср. время приёмки" value={stats?.avgAcceptTime ? `${stats.avgAcceptTime}ч` : '—'} subText="от создания до принятия" gradient="from-indigo-500/10 to-indigo-600/5" iconColor="bg-gradient-to-br from-indigo-500 to-indigo-600" />
      </div>

      {/* Status mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20"><div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-amber-500" /><span className="text-xs text-amber-400 font-medium">Ожидание</span></div><div className="text-2xl font-bold text-amber-400">{sb.pending||0}</div></div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20"><div className="flex items-center gap-2 mb-2"><CheckCircle size={14} className="text-emerald-500" /><span className="text-xs text-emerald-400 font-medium">Принято</span></div><div className="text-2xl font-bold text-emerald-400">{sb.accepted||0}</div></div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20"><div className="flex items-center gap-2 mb-2"><AlertTriangle size={14} className="text-red-500" /><span className="text-xs text-red-400 font-medium">Расхождение</span></div><div className="text-2xl font-bold text-red-400">{sb.discrepancy||0}</div></div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20"><div className="flex items-center gap-2 mb-2"><XCircle size={14} className="text-gray-500" /><span className="text-xs text-gray-400 font-medium">Отменено</span></div><div className="text-2xl font-bold text-gray-400">{sb.cancelled||0}</div></div>
      </div>

      {/* Expense trend + Status donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-surface-card border border-edge">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-content-primary flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><Activity size={16} className="text-orange-500" /></div>Динамика расходов</h3>
            <div className="flex items-center gap-4 text-xs">
              {[['bg-gray-700','Чёрные'],['bg-gray-400','Белые'],['bg-red-500','Красные'],['bg-blue-500','Синие']].map(([cls,lbl]) => (
                <div key={lbl} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${cls}`}/><span className="text-content-muted">{lbl}</span></div>
              ))}
            </div>
          </div>
          <div className="h-72">
            {expenseDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="black" stackId="a" fill="#1f2937" name="Чёрный" />
                  <Bar dataKey="white" stackId="a" fill="#9ca3af" name="Белый" />
                  <Bar dataKey="red"   stackId="a" fill="#ef4444" name="Красный" />
                  <Bar dataKey="blue"  stackId="a" fill="#3b82f6" name="Синий" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-content-muted"><Package size={32} className="opacity-30" /><p className="ml-2 text-sm">Нет расходов</p></div>}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><PieChart size={16} className="text-purple-500" /></div>Статусы переводов</h3>
          <div className="h-56 flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart><Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>{statusPieData.map((e,i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></RePieChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-content-muted"><Package size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
          {statusPieData.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statusPieData.map(item => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-content-muted">{item.name}</span>
                  <span className="text-content-secondary font-medium ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bracelets by day + Color donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Package size={16} className="text-emerald-500" /></div>Браслеты по дням</h3>
          <div className="h-72">
            {braceletDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={braceletDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="black" stackId="a" fill="#1f2937" name="Чёрный" />
                  <Bar dataKey="white" stackId="a" fill="#9ca3af" name="Белый" />
                  <Bar dataKey="red"   stackId="a" fill="#ef4444" name="Красный" />
                  <Bar dataKey="blue"  stackId="a" fill="#3b82f6" name="Синий" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-content-muted"><Package size={32} className="opacity-30" /></div>}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center"><PieChart size={16} className="text-cyan-500" /></div>{isAdminOrOffice ? 'Баланс по цветам' : 'Мой баланс по цветам'}</h3>
          <div className="h-56 flex items-center justify-center">
            {colorPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart><Pie data={colorPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>{colorPieData.map((e,i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></RePieChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-content-muted"><Package size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
          {colorPieData.length > 0 && (
            <div className="space-y-2 mt-2">
              {colorPieData.map(item => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-600" style={{ backgroundColor: item.color }} />
                  <span className="text-content-muted">{item.name}</span>
                  <span className="text-content-secondary font-medium ml-auto">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bracelet progress bars + User roles pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Package size={16} className="text-emerald-500" /></div>Распределение в переводах</h3>
          <div className="space-y-3">
            {braceletBarData.map(item => {
              const maxValue = Math.max(...braceletBarData.map(b => b.value), 1);
              const pct = Math.round((item.value / maxValue) * 100);
              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border border-gray-600" style={{ backgroundColor: item.fill }} /><span className="text-content-secondary">{item.name}</span></div>
                    <span className="font-semibold text-content-primary">{item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-surface-primary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.fill, boxShadow: `0 0 8px ${item.fill}40` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-edge flex items-center justify-between">
            <span className="text-sm text-content-muted">Всего браслетов</span>
            <span className="text-xl font-bold text-content-primary">{(s.totalBracelets||0).toLocaleString()}</span>
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><UsersIcon size={16} className="text-purple-500" /></div>Пользователи по ролям</h3>
          <div className="h-52 flex items-center">
            {rolePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart><Pie data={rolePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>{rolePieData.map((e,i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></RePieChart>
              </ResponsiveContainer>
            ) : <div className="w-full text-center text-content-muted"><UsersIcon size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {rolePieData.map(item => (
              <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-surface-primary">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-content-muted flex-1">{item.name}</span>
                <span className="text-sm font-semibold text-content-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isAdminOrOffice && (
          <div className="p-5 rounded-2xl bg-surface-card border border-edge">
            <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center"><Globe size={16} className="text-teal-500" /></div>Топ стран по балансу</h3>
            {(stats?.topCountries||[]).length > 0 ? (
              <div className="space-y-2">
                {stats.topCountries.map((c,i) => {
                  const maxB = Math.max(...stats.topCountries.map(x => x.balance), 1);
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-primary">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-500/20 text-amber-400':i===1?'bg-gray-400/20 text-gray-400':i===2?'bg-orange-600/20 text-orange-400':'bg-surface-card text-content-muted'}`}>{i+1}</div>
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-content-primary truncate">{c.name}</div><div className="h-1.5 bg-surface-card rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${Math.round((c.balance/maxB)*100)}%` }} /></div></div>
                      <span className="text-sm font-bold text-teal-400">{c.balance.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-center py-8 text-content-muted"><Globe size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
        )}
        {!isCity && (
          <div className="p-5 rounded-2xl bg-surface-card border border-edge">
            <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><Building2 size={16} className="text-orange-500" /></div>{isCountry ? 'Мои города по балансу' : 'Топ городов по балансу'}</h3>
            {(stats?.topCities||[]).length > 0 ? (
              <div className="space-y-2">
                {stats.topCities.map((c,i) => {
                  const maxB = Math.max(...stats.topCities.map(x => x.balance), 1);
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-primary">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-500/20 text-amber-400':i===1?'bg-gray-400/20 text-gray-400':i===2?'bg-orange-600/20 text-orange-400':'bg-surface-card text-content-muted'}`}>{i+1}</div>
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-content-primary truncate">{c.name}</div><div className="text-xs text-content-muted">{c.country}</div><div className="h-1.5 bg-surface-card rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${Math.round((c.balance/maxB)*100)}%` }} /></div></div>
                      <span className="text-sm font-bold text-orange-400">{c.balance.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-center py-8 text-content-muted"><Building2 size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
        )}
      </div>

      {/* Losses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><TrendingDown size={16} className="text-red-500" /></div>Потери по дням</h3>
          <div className="h-64">
            {lossDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lossDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="black" stackId="a" fill="#1f2937" name="Чёрный" />
                  <Bar dataKey="white" stackId="a" fill="#9ca3af" name="Белый" />
                  <Bar dataKey="red"   stackId="a" fill="#ef4444" name="Красный" />
                  <Bar dataKey="blue"  stackId="a" fill="#3b82f6" name="Синий" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-content-muted"><TrendingDown size={32} className="opacity-30" /></div>}
          </div>
        </div>
        {!isCity && (
          <div className="p-5 rounded-2xl bg-surface-card border border-edge">
            <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4"><div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><Globe size={16} className="text-red-500" /></div>{isCountry ? 'Потери по моим городам' : 'Потери по странам'}</h3>
            {(stats?.lossByCountry||[]).length > 0 ? (
              <div className="space-y-2.5">
                {stats.lossByCountry.slice(0,8).map((c,i) => {
                  const maxL = Math.max(...stats.lossByCountry.map(x => x.total), 1);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm"><span className="text-content-secondary truncate">{c.country}</span><span className="font-semibold text-red-400">{c.total.toLocaleString()}</span></div>
                      <div className="h-1.5 bg-surface-primary rounded-full overflow-hidden"><div className="h-full rounded-full bg-red-500/70 transition-all duration-500" style={{ width: `${Math.round((c.total/maxL)*100)}%` }} /></div>
                      <div className="flex gap-2 text-[10px] text-content-muted">
                        {c.black>0 && <span>●Ч:{c.black}</span>}{c.white>0 && <span>○Б:{c.white}</span>}{c.red>0 && <span className="text-red-400">●К:{c.red}</span>}{c.blue>0 && <span className="text-blue-400">●С:{c.blue}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-center py-8 text-content-muted"><TrendingDown size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет данных</p></div>}
          </div>
        )}
      </div>

      {/* Top expense cities */}
      <div className="p-5 rounded-2xl bg-surface-card border border-edge">
        <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><Trophy size={16} className="text-amber-500" /></div>Топ по расходам
        </h3>
        {topExpenseCities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-edge"><th className="text-left py-2.5 px-3 text-content-muted font-medium">#</th><th className="text-left py-2.5 px-3 text-content-muted font-medium">Город</th><th className="text-right py-2.5 px-3 text-content-muted font-medium">Всего</th><th className="text-right py-2.5 px-3 text-content-muted font-medium">Ч</th><th className="text-right py-2.5 px-3 text-content-muted font-medium">Б</th><th className="text-right py-2.5 px-3 text-content-muted font-medium">К</th><th className="text-right py-2.5 px-3 text-content-muted font-medium">С</th></tr></thead>
              <tbody>
                {topExpenseCities.map((c,i) => (
                  <tr key={i} className="border-b border-edge/50 hover:bg-surface-primary transition-colors">
                    <td className="py-2.5 px-3"><div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-500/20 text-amber-400':i===1?'bg-gray-400/20 text-gray-400':i===2?'bg-orange-600/20 text-orange-400':'text-content-muted'}`}>{i+1}</div></td>
                    <td className="py-2.5 px-3 font-medium text-content-primary">{c.city}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-orange-400">{c.total.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">{c.black||'—'}</td>
                    <td className="py-2.5 px-3 text-right text-gray-300">{c.white||'—'}</td>
                    <td className="py-2.5 px-3 text-right text-red-400">{c.red||'—'}</td>
                    <td className="py-2.5 px-3 text-right text-blue-400">{c.blue||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-center py-8 text-content-muted"><Package size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Нет расходов</p></div>}
      </div>
    </div>
  );
}
