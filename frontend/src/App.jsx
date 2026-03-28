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
  Check, X, Ban, Loader2, Send, CheckCircle, XCircle
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
  const [rejectItems, setRejectItems] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
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
    setRejectItems({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
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

  // Handle reject (submit received quantities → accept API handles discrepancy detection)
  const handleReject = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const items = Object.entries(rejectItems)
        .filter(([_, qty]) => qty > 0)
        .map(([itemType, receivedQuantity]) => ({ itemType, receivedQuantity }));
      await transfersApi.accept(selectedTransfer.id, items);
      setRejectModalOpen(false);
      setSelectedTransfer(null);
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

      {/* Reject Modal — numeric received quantity inputs */}
      {rejectModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-edge rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-edge">
              <h3 className="text-lg font-semibold text-content-primary">Сколько браслетов получено?</h3>
              <button
                onClick={() => setRejectModalOpen(false)}
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
                  const sentItem = selectedTransfer.items?.find(i => i.itemType === color);
                  const sentQty = sentItem ? (sentItem.quantity || sentItem.sentQuantity || 0) : 0;
                  const diff = rejectItems[color] - sentQty;
                  return (
                    <div key={color} className="space-y-1">
                      <label className="text-xs text-content-muted">{colorLabels[color]}</label>
                      <input
                        type="number"
                        min="0"
                        value={rejectItems[color]}
                        onChange={(e) => setRejectItems(prev => ({ ...prev, [color]: parseInt(e.target.value) || 0 }))}
                        className={`w-full px-3 py-2 border-2 ${colorClasses[color]} bg-surface-primary text-content-primary rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:outline-none`}
                      />
                      {sentQty > 0 && diff !== 0 && (
                        <p className={`text-xs ${diff < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                          {diff < 0 ? `−${Math.abs(diff)} недостача` : `+${diff} излишек`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Discrepancy warning */}
              {(() => {
                const hasDiscrepancy = selectedTransfer.items?.some(item => {
                  const sent = item.quantity || item.sentQuantity || 0;
                  return rejectItems[item.itemType] !== sent;
                });
                return hasDiscrepancy ? (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                    ⚠️ Количество не совпадает с отправленным — будет создана расхождение
                  </div>
                ) : null;
              })()}

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
                disabled={actionLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Подтвердить
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
  const [topSenders, setTopSenders] = useState([]);
  const [topReceivers, setTopReceivers] = useState([]);
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

      // Fetch backend stats (primary) + users + events in parallel
      const [statsRes, usersRes, eventsRes] = await Promise.all([
        transfersApi.getStats(params).catch((e) => { console.error('Stats API error:', e); return { data: null }; }),
        usersApi.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        eventsApi.getAll().catch(() => ({ data: [] })),
      ]);

      // --- Parse backend stats response ---
      // Axios interceptor unwraps { success, data } → res.data = inner data
      const stats = statsRes?.data?.data || statsRes?.data || null;

      if (stats && stats.summary) {
        // Backend returned full stats — use them directly
        const { summary, statusBreakdown, braceletBreakdown, trend } = stats;

        const byStatus = {
          SENT: statusBreakdown?.pending || 0,
          ACCEPTED: statusBreakdown?.accepted || 0,
          DISCREPANCY_FOUND: statusBreakdown?.discrepancy || 0,
          CANCELLED: statusBreakdown?.cancelled || 0,
        };

        const byType = {
          BLACK: braceletBreakdown?.black || 0,
          WHITE: braceletBreakdown?.white || 0,
          RED: braceletBreakdown?.red || 0,
          BLUE: braceletBreakdown?.blue || 0,
        };

        const dailyTrend = (trend || []).slice(-14).map((t) => ({
          date: new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
          sent: t.count || 0,
          received: 0,
          problematic: 0,
        }));

        setTransferStats({
          total: summary.totalTransfers || 0,
          byStatus,
          byType,
          dailyTrend,
          totalBracelets: summary.totalBracelets || 0,
          totalLoss: summary.totalLoss || 0,
          prevPeriodChange: 0,
        });
      } else {
        // Fallback: no backend stats available
        setTransferStats({
          total: 0, byStatus: { SENT: 0, ACCEPTED: 0, DISCREPANCY_FOUND: 0, CANCELLED: 0 },
          byType: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
          dailyTrend: [], totalBracelets: 0, totalLoss: 0, prevPeriodChange: 0,
        });
      }

      setTopSenders([]);
      setTopReceivers([]);

      // --- Process user statistics ---
      const usersRaw = usersRes?.data;
      const users = usersRaw?.data || (Array.isArray(usersRaw) ? usersRaw : []);
      const userList = Array.isArray(users) ? users : [];
      const byRole = userList.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      }, {});

      // Use backend stats totalUsers as fallback when users endpoint is restricted
      const totalUsersFromStats = stats?.summary?.totalUsers || 0;
      
      setUserStats({
        total: userList.length || totalUsersFromStats,
        byRole,
        active: userList.length > 0 ? userList.filter(u => u.isActive !== false).length : totalUsersFromStats,
      });

      // --- Process event statistics ---
      const eventsRaw = eventsRes?.data;
      const events = eventsRaw?.data || (Array.isArray(eventsRaw) ? eventsRaw : []);
      const eventList = Array.isArray(events) ? events : [];
      const activeEvents = eventList.filter(e => e.active !== false && e.isActive !== false);

      // Use backend stats totalEvents as fallback
      const totalEventsFromStats = stats?.summary?.totalEvents || 0;
      
      setEventStats({
        total: eventList.length || totalEventsFromStats,
        active: activeEvents.length,
        byCountry: eventList.reduce((acc, e) => {
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
      { name: 'Чёрный', value: transferStats.byType.BLACK, fill: '#1f2937' },
      { name: 'Белый', value: transferStats.byType.WHITE, fill: '#e5e7eb' },
      { name: 'Красный', value: transferStats.byType.RED, fill: '#ef4444' },
      { name: 'Синий', value: transferStats.byType.BLUE, fill: '#3b82f6' },
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

  const StatCard = ({ icon: Icon, label, value, subText, gradient, trend, iconColor }) => (
    <div className={`relative overflow-hidden p-5 rounded-2xl border border-edge bg-gradient-to-br ${gradient} hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-300 group`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-110 transition-transform" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-11 h-11 rounded-xl ${iconColor} flex items-center justify-center shadow-lg`}>
            <Icon size={20} className="text-white" />
          </div>
          {trend !== undefined && trend !== 0 && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              trend > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-content-primary mb-1">{value?.toLocaleString() || 0}</div>
        <div className="text-sm text-content-muted">{label}</div>
        {subText && <div className="text-xs text-content-muted/70 mt-1">{subText}</div>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Статистика</h1>
            <p className="text-sm text-content-muted">Загрузка данных...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Статистика</h1>
            <p className="text-sm text-content-muted">Аналитика и показатели системы</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-surface-card rounded-xl p-1 border border-edge">
          {['week', 'month', 'quarter', 'year'].map((period) => (
            <button
              key={period}
              onClick={() => setDateRange(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                dateRange === period
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'hover:bg-surface-card-hover text-content-secondary'
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
            className="p-2 rounded-lg hover:bg-surface-card-hover transition-colors ml-1"
            title="Обновить"
          >
            <RefreshCw size={18} className="text-content-muted" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={ArrowRightLeft} 
          label="Переводы" 
          value={transferStats?.total} 
          subText="за выбранный период"
          gradient="from-blue-500/10 to-blue-600/5"
          iconColor="bg-gradient-to-br from-blue-500 to-blue-600"
          trend={transferStats?.prevPeriodChange}
        />
        <StatCard 
          icon={Package} 
          label="Браслеты" 
          value={transferStats?.totalBracelets} 
          subText="перемещено"
          gradient="from-emerald-500/10 to-emerald-600/5"
          iconColor="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <StatCard 
          icon={UsersIcon} 
          label="Пользователи" 
          value={userStats?.total} 
          subText={`${userStats?.active || 0} активных`}
          gradient="from-purple-500/10 to-purple-600/5"
          iconColor="bg-gradient-to-br from-purple-500 to-purple-600"
        />
        <StatCard 
          icon={Calendar} 
          label="Мероприятия" 
          value={eventStats?.total} 
          subText={`${eventStats?.active || 0} активных`}
          gradient="from-amber-500/10 to-amber-600/5"
          iconColor="bg-gradient-to-br from-amber-500 to-amber-600"
        />
      </div>

      {/* Status Mini Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-amber-500" />
            <span className="text-xs text-amber-400 font-medium">Ожидание</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{transferStats?.byStatus?.SENT || 0}</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-xs text-emerald-400 font-medium">Принято</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{transferStats?.byStatus?.ACCEPTED || 0}</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-500" />
            <span className="text-xs text-red-400 font-medium">Расхождение</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{transferStats?.byStatus?.DISCREPANCY_FOUND || 0}</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={14} className="text-gray-500" />
            <span className="text-xs text-gray-400 font-medium">Отменено</span>
          </div>
          <div className="text-2xl font-bold text-gray-400">{transferStats?.byStatus?.CANCELLED || 0}</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Transfer Trend - Full Width */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-surface-card border border-edge">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-content-primary flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Activity size={16} className="text-blue-500" />
              </div>
              Динамика переводов
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-content-muted">Отправлено</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-content-muted">Принято</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-content-muted">Проблемные</span>
              </div>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={transferStats?.dailyTrend || []}>
                <defs>
                  <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--edge)" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-card)', 
                    border: '1px solid var(--edge)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    color: 'var(--content-primary)'
                  }} 
                />
                <Area type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradSent)" name="Отправлено" />
                <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#gradReceived)" name="Принято" />
                <Line type="monotone" dataKey="problematic" stroke="#ef4444" name="Проблемные" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Donut Chart */}
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <PieChart size={16} className="text-purple-500" />
            </div>
            Статусы
          </h3>
          <div className="h-64 flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--surface-card)', 
                      border: '1px solid var(--edge)',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }} 
                  />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-content-muted">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Нет данных</p>
              </div>
            )}
          </div>
          {statusPieData.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statusPieData.map((item) => (
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

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bracelet Distribution */}
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package size={16} className="text-emerald-500" />
            </div>
            Распределение по цветам
          </h3>
          <div className="space-y-3">
            {braceletBarData.map((item) => {
              const maxValue = Math.max(...braceletBarData.map(b => b.value), 1);
              const percentage = Math.round((item.value / maxValue) * 100);
              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border border-gray-600" style={{ backgroundColor: item.fill }} />
                      <span className="text-content-secondary">{item.name}</span>
                    </div>
                    <span className="font-semibold text-content-primary">{item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-surface-primary rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${percentage}%`, 
                        backgroundColor: item.fill,
                        boxShadow: `0 0 8px ${item.fill}40`
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-edge">
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-muted">Всего браслетов</span>
              <span className="text-xl font-bold text-content-primary">{transferStats?.totalBracelets?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>

        {/* User Roles Distribution */}
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <UsersIcon size={16} className="text-purple-500" />
            </div>
            Пользователи по ролям
          </h3>
          <div className="h-52 flex items-center">
            {rolePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={rolePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {rolePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--surface-card)', 
                      border: '1px solid var(--edge)',
                      borderRadius: '12px'
                    }} 
                  />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full text-center text-content-muted">
                <UsersIcon size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Нет данных</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {rolePieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-surface-primary">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-content-muted flex-1">{item.name}</span>
                <span className="text-sm font-semibold text-content-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Senders & Receivers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Senders */}
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Send size={16} className="text-blue-500" />
            </div>
            Топ отправители
          </h3>
          {topSenders.length > 0 ? (
            <div className="space-y-3">
              {topSenders.map((sender, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-primary hover:bg-surface-card-hover transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                    idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                    idx === 2 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-surface-card text-content-muted'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-content-primary truncate">{sender.name}</div>
                    <div className="text-xs text-content-muted">{sender.count} переводов</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-blue-400">{sender.bracelets.toLocaleString()}</div>
                    <div className="text-xs text-content-muted">браслетов</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-content-muted">
              <Send size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Нет данных</p>
            </div>
          )}
        </div>

        {/* Top Receivers */}
        <div className="p-5 rounded-2xl bg-surface-card border border-edge">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Download size={16} className="text-emerald-500" />
            </div>
            Топ получатели
          </h3>
          {topReceivers.length > 0 ? (
            <div className="space-y-3">
              {topReceivers.map((receiver, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-primary hover:bg-surface-card-hover transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                    idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                    idx === 2 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-surface-card text-content-muted'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-content-primary truncate">{receiver.name}</div>
                    <div className="text-xs text-content-muted">{receiver.count} переводов</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-emerald-400">{receiver.bracelets.toLocaleString()}</div>
                    <div className="text-xs text-content-muted">браслетов</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-content-muted">
              <Download size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Нет данных</p>
            </div>
          )}
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
