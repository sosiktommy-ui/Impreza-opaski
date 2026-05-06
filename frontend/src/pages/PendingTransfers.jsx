import { useState, useEffect, useMemo } from 'react';
import {
  Clock, RefreshCw, Search, ArrowRight, Check, X, Ban, Loader2, Calendar,
} from 'lucide-react';
import { transfersApi } from '../api/transfers';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore, useBadgeStore } from '../store/useAppStore';
import Skeleton from '../components/ui/Skeleton';
import BraceletBadge from '../components/ui/BraceletBadge';
import {
  getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass,
} from '../utils/transferHelpers';

export default function PendingTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const { countryId, cityId } = useFilterStore();
  const { user: currentUser } = useAuthStore();

  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [acceptItems, setAcceptItems] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [rejectItems, setRejectItems] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => { loadPendingTransfers(); }, [countryId, cityId]);

  const loadPendingTransfers = async () => {
    setLoading(true);
    try {
      const params = { status: 'SENT', limit: 500 };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      const { data } = await transfersApi.getAll(params);
      const list = data?.data || data || [];
      setTransfers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Не удалось загрузить незавершённые переводы');
    } finally {
      setLoading(false);
    }
  };

  const isReceiver = (t) => t.receiverId === currentUser?.id || t.receiverCityId === currentUser?.cityId;
  const isSender  = (t) => t.senderId  === currentUser?.id || t.senderCityId  === currentUser?.cityId;
  const isAdmin   = currentUser?.role === 'ADMIN';

  const openAcceptModal = (transfer) => {
    setSelectedTransfer(transfer);
    const items = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
    transfer.items?.forEach(item => { if (items.hasOwnProperty(item.itemType)) items[item.itemType] = item.quantity || item.sentQuantity || 0; });
    setAcceptItems(items);
    setActionError(null);
    setAcceptModalOpen(true);
  };
  const openRejectModal = (transfer) => { setSelectedTransfer(transfer); setRejectItems({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 }); setActionError(null); setRejectModalOpen(true); };
  const openCancelModal = (transfer) => { setSelectedTransfer(transfer); setActionError(null); setCancelModalOpen(true); };

  const refreshBadges = () => useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);

  const handleAccept = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true); setActionError(null);
    try {
      const items = Object.entries(acceptItems).filter(([_, q]) => q > 0).map(([itemType, receivedQuantity]) => ({ itemType, receivedQuantity }));
      await transfersApi.accept(selectedTransfer.id, items);
      setAcceptModalOpen(false); setSelectedTransfer(null); loadPendingTransfers(); refreshBadges();
    } catch (err) { setActionError(err.response?.data?.message || 'Ошибка при принятии перевода'); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true); setActionError(null);
    try {
      const items = Object.entries(rejectItems).filter(([_, q]) => q > 0).map(([itemType, receivedQuantity]) => ({ itemType, receivedQuantity }));
      await transfersApi.accept(selectedTransfer.id, items);
      setRejectModalOpen(false); setSelectedTransfer(null); loadPendingTransfers(); refreshBadges();
    } catch (err) { setActionError(err.response?.data?.message || 'Ошибка при отклонении перевода'); }
    finally { setActionLoading(false); }
  };

  const handleCancel = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true); setActionError(null);
    try {
      await transfersApi.cancel(selectedTransfer.id);
      setCancelModalOpen(false); setSelectedTransfer(null); loadPendingTransfers(); refreshBadges();
    } catch (err) { setActionError(err.response?.data?.message || 'Ошибка при отмене перевода'); }
    finally { setActionLoading(false); }
  };

  const getPendingDuration = (createdAt) => {
    const diffMs = new Date() - new Date(createdAt);
    const d = Math.floor(diffMs / 86400000);
    const h = Math.floor((diffMs % 86400000) / 3600000);
    return d > 0 ? `${d}д ${h}ч` : `${h}ч`;
  };

  const getSeverityColor = (createdAt) => {
    const diffH = (new Date() - new Date(createdAt)) / 3600000;
    if (diffH > 72) return 'border-red-500/50 bg-red-500/5';
    if (diffH > 24) return 'border-amber-500/50 bg-amber-500/5';
    return 'border-edge bg-surface-card';
  };

  const filteredTransfers = useMemo(() => {
    if (!search.trim()) return transfers;
    const q = search.toLowerCase();
    return transfers.filter(t => getSenderName(t).toLowerCase().includes(q) || getReceiverName(t).toLowerCase().includes(q) || (t.id || '').toLowerCase().includes(q));
  }, [transfers, search]);

  const COLOR_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
  const COLOR_CLASSES = { BLACK: 'border-gray-600', WHITE: 'border-gray-300', RED: 'border-red-500', BLUE: 'border-blue-500' };

  if (loading) return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-content-muted">{filteredTransfers.length} переводов ожидают подтверждения</p>
        </div>
        <button onClick={loadPendingTransfers} className="p-2 rounded-lg hover:bg-surface-card-hover transition-colors">
          <RefreshCw size={18} className="text-content-muted" />
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input type="text" placeholder="Поиск по отправителю или получателю..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-edge bg-surface-card text-content-primary rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none" />
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {filteredTransfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Нет незавершённых переводов</h3>
          <p className="text-sm text-content-muted">Все переводы обработаны</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTransfers.map((transfer) => {
            const sender = getSenderName(transfer);
            const receiver = getReceiverName(transfer);
            const totalQty = getTotalQuantity(transfer);
            const canAccept = isAdmin || isReceiver(transfer);
            const canCancel = isAdmin;
            return (
              <div key={transfer.id} className={`p-4 rounded-xl border transition-all ${getSeverityColor(transfer.createdAt)} ${getTransferCardClass(transfer)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono bg-surface-primary px-2 py-0.5 rounded text-content-muted">#{transfer.id?.slice(-6)}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">В процессе · {getPendingDuration(transfer.createdAt)}</span>
                      {isAdminTransfer(transfer) && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm mb-3">
                      <span className="font-medium text-blue-400">{sender}</span>
                      <ArrowRight size={14} className="text-content-muted" />
                      <span className="font-medium text-emerald-400">{receiver}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {transfer.items?.map((item) => <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />)}
                      <span className="text-xs text-content-muted">Итого: {totalQty} шт</span>
                    </div>
                    {transfer.event?.name && (
                      <div className="mt-2 text-xs text-content-muted flex items-center gap-1"><Calendar size={12} />{transfer.event.name}</div>
                    )}
                  </div>
                  <div className="text-xs text-content-muted">{new Date(transfer.createdAt).toLocaleDateString('ru-RU')}</div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-edge">
                  {canAccept && (
                    <button onClick={() => openAcceptModal(transfer)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors">
                      <Check size={14} />Принять
                    </button>
                  )}
                  {canAccept && (
                    <button onClick={() => openRejectModal(transfer)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors">
                      <X size={14} />Оспорить
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => openCancelModal(transfer)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
                      <Ban size={14} />Отменить
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
              <button onClick={() => setAcceptModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-card-hover"><X size={20} className="text-content-muted" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">Укажите фактическое количество полученных браслетов:</p>
              <div className="p-3 rounded-lg bg-surface-primary border border-edge">
                <p className="text-xs text-content-muted mb-2">Отправлено:</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedTransfer.items?.map(item => <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['BLACK','WHITE','RED','BLUE'].map(color => (
                  <div key={color} className="space-y-1">
                    <label className="text-xs text-content-muted">{COLOR_LABELS[color]}</label>
                    <input type="number" min="0" value={acceptItems[color]}
                      onChange={e => setAcceptItems(prev => ({ ...prev, [color]: parseInt(e.target.value) || 0 }))}
                      className={`w-full px-3 py-2 border-2 ${COLOR_CLASSES[color]} bg-surface-primary text-content-primary rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:outline-none`} />
                  </div>
                ))}
              </div>
              {actionError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{actionError}</div>}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button onClick={() => setAcceptModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover">Отмена</button>
              <button onClick={handleAccept} disabled={actionLoading} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Принять
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
              <h3 className="text-lg font-semibold text-content-primary">Сколько браслетов получено?</h3>
              <button onClick={() => setRejectModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-card-hover"><X size={20} className="text-content-muted" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">Укажите фактическое количество полученных браслетов:</p>
              <div className="p-3 rounded-lg bg-surface-primary border border-edge">
                <p className="text-xs text-content-muted mb-2">Отправлено:</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedTransfer.items?.map(item => <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['BLACK','WHITE','RED','BLUE'].map(color => {
                  const sentItem = selectedTransfer.items?.find(i => i.itemType === color);
                  const sentQty = sentItem ? (sentItem.quantity || sentItem.sentQuantity || 0) : 0;
                  const diff = rejectItems[color] - sentQty;
                  return (
                    <div key={color} className="space-y-1">
                      <label className="text-xs text-content-muted">{COLOR_LABELS[color]}</label>
                      <input type="number" min="0" value={rejectItems[color]}
                        onChange={e => setRejectItems(prev => ({ ...prev, [color]: parseInt(e.target.value) || 0 }))}
                        className={`w-full px-3 py-2 border-2 ${COLOR_CLASSES[color]} bg-surface-primary text-content-primary rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:outline-none`} />
                      {sentQty > 0 && diff !== 0 && <p className={`text-xs ${diff < 0 ? 'text-red-400' : 'text-amber-400'}`}>{diff < 0 ? `−${Math.abs(diff)} недостача` : `+${diff} излишек`}</p>}
                    </div>
                  );
                })}
              </div>
              {(() => {
                const hasDisc = selectedTransfer.items?.some(item => rejectItems[item.itemType] !== (item.quantity || item.sentQuantity || 0));
                return hasDisc ? <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">⚠️ Количество не совпадает — будет создано расхождение</div> : null;
              })()}
              {actionError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{actionError}</div>}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button onClick={() => setRejectModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover">Назад</button>
              <button onClick={handleReject} disabled={actionLoading} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Подтвердить
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
              <button onClick={() => setCancelModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-card-hover"><X size={20} className="text-content-muted" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-content-muted">Вы уверены, что хотите отменить этот перевод?</p>
              <div className="p-3 rounded-lg bg-surface-primary border border-edge">
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span className="font-medium text-blue-400">{getSenderName(selectedTransfer)}</span>
                  <ArrowRight size={14} className="text-content-muted" />
                  <span className="font-medium text-emerald-400">{getReceiverName(selectedTransfer)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedTransfer.items?.map(item => <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity || item.sentQuantity || 0} />)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">⚠️ Браслеты вернутся отправителю</div>
              {actionError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{actionError}</div>}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-edge">
              <button onClick={() => setCancelModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-content-muted bg-surface-primary border border-edge rounded-lg hover:bg-surface-card-hover">Назад</button>
              <button onClick={handleCancel} disabled={actionLoading} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}Отменить перевод
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
