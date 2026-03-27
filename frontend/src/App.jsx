import { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { useFilterStore, useBadgeStore } from './store/useAppStore';
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
import CompanyLosses from './pages/CompanyLosses';
import { transfersApi } from './api/transfers';
import { eventsApi } from './api/events';
import { usersApi } from './api/users';
import { inventoryApi } from './api/inventory';
import {
  Clock, AlertTriangle, Package, TrendingDown, TrendingUp,
  ArrowRight, ArrowRightLeft, Calendar, Filter, RefreshCw, Download,
  BarChart3, PieChart, Activity, Users as UsersIcon, MapPin, Search,
  Check, X, Ban, Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
  LineChart, Line, Legend, Area, AreaChart
} from 'recharts';
import Skeleton from './components/ui/Skeleton';
import BraceletBadge from './components/ui/BraceletBadge';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from './utils/transferHelpers';

// ============ PENDING TRANSFERS PAGE ============
function PendingTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const { countryId, cityId } = useFilterStore();
  const { user: currentUser } = useAuthStore();

  // Modal states
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [acceptItems, setAcceptItems] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    loadPendingTransfers();
  }, [countryId, cityId]);

  const loadPendingTransfers = async () => {
    setLoading(true);
    try {
      // Use getAll with status SENT to match badge calculation
      const params = { status: 'SENT', limit: 500 };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      
      const { data } = await transfersApi.getAll(params);
      // Handle paginated response: { data: [...], meta: {...} }
      const transfers = data?.data || data || [];
      setTransfers(Array.isArray(transfers) ? transfers : []);
    } catch (err) {
      setError('Не удалось загрузить зависшие переводы');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Check if current user is receiver/sender/admin
  const isReceiver = (transfer) => {
    return transfer.receiverId === currentUser?.id || 
           transfer.receiverCityId === currentUser?.cityId;
  };
  const isSender = (transfer) => {
    return transfer.senderId === currentUser?.id || 
           transfer.senderCityId === currentUser?.cityId;
  };
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  // Open accept modal
  const openAcceptModal = (transfer) => {
    setSelectedTransfer(transfer);
    // Pre-fill with sent quantities
    const items = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
    transfer.items?.forEach(item => {
      if (items.hasOwnProperty(item.itemType)) {
        items[item.itemType] = item.quantity || item.sentQuantity || 0;
      }
    });
    setAcceptItems(items);
    setActionError(null);
    setAcceptModalOpen(true);
  };

  // Open reject modal
  const openRejectModal = (transfer) => {
    setSelectedTransfer(transfer);
    setRejectReason('');
    setActionError(null);
    setRejectModalOpen(true);
  };

  // Open cancel modal
  const openCancelModal = (transfer) => {
    setSelectedTransfer(transfer);
    setActionError(null);
    setCancelModalOpen(true);
  };

  // Handle accept
  const handleAccept = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const items = Object.entries(acceptItems)
        .filter(([_, qty]) => qty > 0)
        .map(([itemType, receivedQuantity]) => ({ itemType, receivedQuantity }));
      await transfersApi.accept(selectedTransfer.id, items);
      setAcceptModalOpen(false);
      setSelectedTransfer(null);
      loadPendingTransfers();
      // Update sidebar badges immediately
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Ошибка при принятии перевода');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!selectedTransfer || !rejectReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await transfersApi.reject(selectedTransfer.id, rejectReason);
      setRejectModalOpen(false);
      setSelectedTransfer(null);
      setRejectReason('');
      loadPendingTransfers();
      // Update sidebar badges immediately
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Ошибка при отклонении перевода');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await transfersApi.cancel(selectedTransfer.id);
      setCancelModalOpen(false);
      setSelectedTransfer(null);
      loadPendingTransfers();
      // Update sidebar badges immediately
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Ошибка при отмене перевода');
    } finally {
      setActionLoading(false);
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

  // Filter by search
  const filteredTransfers = useMemo(() => {
    if (!search.trim()) return transfers;
    const q = search.toLowerCase();
    return transfers.filter(t => {
      const sender = getSenderName(t).toLowerCase();
      const receiver = getReceiverName(t).toLowerCase();
      const id = (t.id || '').toLowerCase();
      return sender.includes(q) || receiver.includes(q) || id.includes(q);
    });
  }, [transfers, search]);

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
              {filteredTransfers.length} переводов в ожидании
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          placeholder="Поиск по отправителю или получателю..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-edge bg-surface-card text-content-primary rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {filteredTransfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Нет зависших переводов</h3>
          <p className="text-sm text-content-muted">Все переводы обработаны вовремя</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTransfers.map((transfer) => {
            const isAdminTx = isAdminTransfer(transfer);
            const sender = getSenderName(transfer);
            const receiver = getReceiverName(transfer);
            const totalQty = getTotalQuantity(transfer);
            const canAccept = isAdmin || isReceiver(transfer);
            const canReject = isAdmin || isReceiver(transfer);
            const canCancel = isAdmin; // Only ADMIN can cancel
            return (
            <div
              key={transfer.id}
              className={`p-4 rounded-xl border transition-all ${getSeverityColor(transfer.createdAt)} ${getTransferCardClass(transfer)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-mono bg-surface-primary px-2 py-0.5 rounded text-content-muted">
                      #{transfer.id?.slice(-6)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">
                      Ожидает {getPendingDuration(transfer.createdAt)}
                    </span>
                    {isAdminTx && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                  </div>

                  <div className="flex items-center gap-2 text-sm mb-3">
                    <span className="font-medium text-blue-400">
                      {sender}
                    </span>
                    <ArrowRight size={14} className="text-content-muted" />
                    <span className="font-medium text-emerald-400">
                      {receiver}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {transfer.items?.map((item) => (
                      <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />
                    ))}
                    <span className="text-xs text-content-muted">Итого: {totalQty} шт</span>
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
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-edge">
                {canAccept && (
                  <button
                    onClick={() => openAcceptModal(transfer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                  >
                    <Check size={14} />
                    Принять
                  </button>
                )}
                {canReject && (
                  <button
                    onClick={() => openRejectModal(transfer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
                  >
                    <X size={14} />
                    Отклонить
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => openCancelModal(transfer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    <Ban size={14} />
                    Отменить
                  </button>
                )}
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* Accept Modal */}
      {acceptModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-edge rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-edge">
              <h3 className="text-lg font-semibold text-content-primary">Принять перевод</h3>
              <button
                onClick={() => setAcceptModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                <X size={20} className="text-content-muted" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">
                Укажите фактическое количество полученных браслетов:
              </p>
              
              {/* Sent quantities reference */}
              <div className="p-3 rounded-lg bg-surface-primary border border-edge">
                <p className="text-xs text-content-muted mb-2">Отправлено:</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedTransfer.items?.map((item) => (
                    <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />
                  ))}
                </div>
              </div>

              {/* Input fields for received quantities */}
              <div className="grid grid-cols-2 gap-3">
                {['BLACK', 'WHITE', 'RED', 'BLUE'].map((color) => {
                  const colorLabels = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
                  const colorClasses = { BLACK: 'border-gray-600', WHITE: 'border-gray-300', RED: 'border-red-500', BLUE: 'border-blue-500' };
                  return (
                    <div key={color} className="space-y-1">
                      <label className="text-xs text-content-muted">{colorLabels[color]}</label>
                      <input
                        type="number"
                        min="0"
                        value={acceptItems[color]}
                        onChange={(e) => setAcceptItems(prev => ({ ...prev, [color]: parseInt(e.target.value) || 0 }))}
                        className={`w-full px-3 py-2 border-2 ${colorClasses[color]} bg-surface-primary text-content-primary rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:outline-none`}
                      />
                    </div>
                  );
                })}
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {actionError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button
                onClick={() => setAcceptModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Принять
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-edge rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-edge">
              <h3 className="text-lg font-semibold text-content-primary">Отклонить перевод</h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                <X size={20} className="text-content-muted" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">
                Укажите причину отклонения перевода:
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Причина отклонения..."
                rows={3}
                className="w-full px-3 py-2 border border-edge bg-surface-primary text-content-primary rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none resize-none"
              />
              {actionError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {actionError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-edge rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-edge">
              <h3 className="text-lg font-semibold text-content-primary">Отменить перевод</h3>
              <button
                onClick={() => setCancelModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                <X size={20} className="text-content-muted" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">
                Вы уверены, что хотите отменить этот перевод?
              </p>
              <div className="p-3 rounded-lg bg-surface-primary border border-edge">
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span className="font-medium text-blue-400">{getSenderName(selectedTransfer)}</span>
                  <ArrowRight size={14} className="text-content-muted" />
                  <span className="font-medium text-emerald-400">{getReceiverName(selectedTransfer)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedTransfer.items?.map((item) => (
                    <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                ⚠️ Браслеты вернутся отправителю
              </div>
              {actionError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {actionError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                Отменить перевод
              </button>
            </div>
          </div>
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

      // Fetch all statistics in parallel
      const [statsRes, usersRes, eventsRes, allTransfersRes] = await Promise.all([
        transfersApi.getStats(params).catch((e) => { console.log('Stats API error:', e); return { data: null }; }),
        usersApi.getUsers().catch(() => ({ data: [] })),
        eventsApi.getAll().catch(() => ({ data: [] })),
        // Fallback: also fetch all transfers for manual calculation if stats endpoint fails
        transfersApi.getAll({ limit: 500 }).catch(() => ({ data: [] })),
      ]);

      // Process transfer statistics from stats endpoint
      const stats = statsRes.data;
      if (stats && stats.summary) {
        // Build daily trend from stats.trend
        const dailyTrend = (stats.trend || []).slice(-14).map(item => ({
          date: new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
          sent: item.count,
          received: 0,
          problematic: 0,
        }));

        setTransferStats({
          total: stats.summary?.totalTransfers || 0,
          byStatus: {
            SENT: stats.statusBreakdown?.pending || 0,
            ACCEPTED: stats.statusBreakdown?.accepted || 0,
            DISCREPANCY_FOUND: stats.statusBreakdown?.discrepancy || 0,
            CANCELLED: stats.statusBreakdown?.cancelled || 0,
          },
          byType: {
            BLACK: stats.braceletBreakdown?.black || 0,
            WHITE: stats.braceletBreakdown?.white || 0,
            RED: stats.braceletBreakdown?.red || 0,
            BLUE: stats.braceletBreakdown?.blue || 0,
          },
          dailyTrend,
          totalBracelets: stats.summary?.totalBracelets || 0,
          totalLoss: stats.summary?.totalLoss || 0,
        });
      } else {
        // Fallback: calculate stats from raw transfers if stats endpoint failed
        const transfers = allTransfersRes.data?.data || allTransfersRes.data || [];
        const allTransfers = Array.isArray(transfers) ? transfers : [];
        
        // Calculate date range for filtering
        const now = new Date();
        let periodDays = 30;
        if (dateRange === 'week') periodDays = 7;
        else if (dateRange === 'quarter') periodDays = 90;
        else if (dateRange === 'year') periodDays = 365;
        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
        
        const filteredTransfers = allTransfers.filter(t => new Date(t.createdAt) >= startDate);
        
        // Calculate status breakdown
        const byStatus = { SENT: 0, ACCEPTED: 0, DISCREPANCY_FOUND: 0, CANCELLED: 0 };
        filteredTransfers.forEach(t => {
          if (byStatus[t.status] !== undefined) byStatus[t.status]++;
        });
        
        // Calculate bracelet breakdown
        const byType = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
        let totalBracelets = 0;
        filteredTransfers.forEach(t => {
          (t.items || []).forEach(item => {
            const qty = item.quantity || item.sentQuantity || 0;
            if (byType[item.itemType] !== undefined) {
              byType[item.itemType] += qty;
              totalBracelets += qty;
            }
          });
        });
        
        // Build daily trend
        const trendMap = new Map();
        filteredTransfers.forEach(t => {
          const dateKey = new Date(t.createdAt).toISOString().split('T')[0];
          trendMap.set(dateKey, (trendMap.get(dateKey) || 0) + 1);
        });
        const dailyTrend = Array.from(trendMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-14)
          .map(([date, count]) => ({
            date: new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
            sent: count,
            received: 0,
            problematic: 0,
          }));
        
        setTransferStats({
          total: filteredTransfers.length,
          byStatus,
          byType,
          dailyTrend,
          totalBracelets,
          totalLoss: 0,
        });
      }

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
      SENT: 'Ожидание',
      ACCEPTED: 'Принято',
      DISCREPANCY_FOUND: 'Расхождение',
      CANCELLED: 'Отменено',
    };
    const statusColors = {
      SENT: '#f59e0b',
      ACCEPTED: '#10b981',
      DISCREPANCY_FOUND: '#ef4444',
      CANCELLED: '#6b7280',
    };
    return Object.entries(transferStats.byStatus)
      .filter(([_, count]) => count > 0)
      .map(([status, count]) => ({
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
          path="company-losses"
          element={
            <PrivateRoute roles={['ADMIN', 'OFFICE']}>
              <CompanyLosses />
            </PrivateRoute>
          }
        />
        <Route
          path="balance"
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
