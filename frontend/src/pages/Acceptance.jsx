import { useState, useEffect, useMemo } from 'react';
import { transfersApi } from '../api/transfers';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useBadgeStore } from '../store/useAppStore';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Pagination from '../components/ui/Pagination';
import { CheckCircle, XCircle, AlertTriangle, Package, Search, HelpCircle, PackageCheck, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Acceptance() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'accepted' | 'problematic'
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Accept confirmation modal
  const [acceptTarget, setAcceptTarget] = useState(null);

  // Disagree modal state (per-color input)
  const [disagreeTarget, setDisagreeTarget] = useState(null);
  const [receivedItems, setReceivedItems] = useState({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
  const [disagreeReason, setDisagreeReason] = useState('');

  // Detail modal
  const [detailTarget, setDetailTarget] = useState(null);

  // Helper to check if current user is the receiver of a transfer
  const isUserReceiver = (transfer) => {
    if (user.role === 'COUNTRY' && transfer.receiverType === 'COUNTRY') {
      return transfer.receiverCountryId === user.countryId;
    }
    if (user.role === 'CITY' && transfer.receiverType === 'CITY') {
      return transfer.receiverCityId === user.cityId;
    }
    // ADMIN/OFFICE can be receivers in some flows
    if ((user.role === 'ADMIN' || user.role === 'OFFICE') && 
        (transfer.receiverType === 'ADMIN' || transfer.receiverType === 'OFFICE')) {
      return true;
    }
    return false;
  };

  // Cancel handler for ADMIN only
  const handleCancel = async (transfer) => {
    if (!window.confirm('Вы уверены, что хотите отменить эту отправку?')) return;
    setProcessing(true);
    setError('');
    try {
      await transfersApi.cancel(transfer.id);
      await loadTransfers();
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка отмены');
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, [activeTab]);

  const loadTransfers = async (p = 1) => {
    setLoading(true);
    try {
      if (activeTab === 'pending') {
        // Pending: use dedicated endpoint
        const { data } = await transfersApi.getPending();
        const result = data?.data || data;
        setTransfers(Array.isArray(result) ? result : []);
        setTotalPages(1);
        setPage(1);
      } else if (activeTab === 'accepted') {
        // Accepted: received transfers with ACCEPTED status
        const { data } = await transfersApi.getAll({
          page: p,
          limit: 30,
          direction: 'received',
          status: 'ACCEPTED',
        });
        const payload = data?.data || data;
        const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
        setTransfers(list);
        const meta = data?.meta || payload?.meta;
        setTotalPages(meta?.totalPages || 1);
        setPage(meta?.page || p);
      } else {
        // Problematic: DISCREPANCY_FOUND + REJECTED + CANCELLED received transfers
        const { data } = await transfersApi.getAll({
          page: p,
          limit: 30,
          direction: 'received',
        });
        const payload = data?.data || data;
        const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
        setTransfers(list.filter((t) =>
          ['DISCREPANCY_FOUND', 'REJECTED', 'CANCELLED'].includes(t.status)
        ));
        const meta = data?.meta || payload?.meta;
        setTotalPages(meta?.totalPages || 1);
        setPage(meta?.page || p);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const displayList = useMemo(() => {
    let list = [...transfers];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const sender = getSenderName(t).toLowerCase();
        const receiver = getReceiverName(t).toLowerCase();
        const id = (t.id || '').toLowerCase();
        return sender.includes(q) ||
          receiver.includes(q) ||
          id.includes(q) ||
          (t.notes || '').toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }, [transfers, search]);

  // ── ACCEPT: modal with quantities shown, confirm button ──
  const openAccept = (transfer) => {
    setAcceptTarget(transfer);
    setError('');
  };

  const handleAcceptConfirm = async () => {
    if (!acceptTarget) return;
    setProcessing(true);
    setError('');
    try {
      const items = (acceptTarget.items || []).map((item) => ({
        itemType: item.itemType,
        receivedQuantity: item.quantity,
      }));
      await transfersApi.accept(acceptTarget.id, items);
      setAcceptTarget(null);
      await loadTransfers();
      // Update sidebar badges immediately
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка получения');
    } finally {
      setProcessing(false);
    }
  };

  // ── DISAGREE: open modal to enter total received count ──
  const openDisagree = (transfer) => {
    setDisagreeTarget(transfer);
    setDisagreeReason('');
    setReceivedTotal('');
    setError('');
  };

  const handleDisagreeSubmit = async () => {
    if (!disagreeTarget) return;
    setProcessing(true);
    setError('');

    try {
      // Build items array from per-color inputs
      const items = [];
      let totalReceived = 0;
      
      for (const item of (disagreeTarget.items || [])) {
        const receivedQty = parseInt(receivedItems[item.itemType]) || 0;
        items.push({ itemType: item.itemType, receivedQuantity: receivedQty });
        totalReceived += receivedQty;
      }

      const totalSent = getTotalQuantity(disagreeTarget);

      if (totalReceived === totalSent) {
        // Check if each color matches too
        const allMatch = (disagreeTarget.items || []).every(item => {
          const received = parseInt(receivedItems[item.itemType]) || 0;
          return received === item.quantity;
        });
        if (allMatch) {
          setError('Количество совпадает с отправленным. Используйте кнопку "Принять".');
          setProcessing(false);
          return;
        }
      }

      await transfersApi.accept(disagreeTarget.id, items);
      setDisagreeTarget(null);
      setReceivedItems({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
      setDisagreeReason('');
      await loadTransfers();
      // Update sidebar badges immediately
      useBadgeStore.getState().refreshCounts(transfersApi, inventoryApi);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  const getDisagreePreview = () => {
    if (!disagreeTarget) return null;
    
    let totalReceived = 0;
    for (const item of (disagreeTarget.items || [])) {
      totalReceived += parseInt(receivedItems[item.itemType]) || 0;
    }
    const totalSent = getTotalQuantity(disagreeTarget);
    
    // Check if any value was entered
    const hasAnyInput = Object.values(receivedItems).some(v => v !== '');
    if (!hasAnyInput) return null;

    if (totalReceived === 0) return { type: 'cancelled', label: 'Ничего не получено — отправка будет отменена' };
    if (totalReceived !== totalSent) return { type: 'discrepancy', label: `Расхождение: отправлено ${totalSent}, получено ${totalReceived}` };
    if (totalReceived === totalSent) return { type: 'match', label: 'Количество совпадает — лучше нажмите «Принять»' };
    return null;
  };

  if (loading && transfers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-content-primary flex items-center gap-2"><PackageCheck size={22} className="text-brand-500" /> Получение</h2>

      {/* ── 3 Tabs ── */}
      <div className="flex gap-1 bg-surface-secondary rounded-[var(--radius-sm)] p-1">
        {[
          { key: 'pending', label: 'Ожидают', tooltip: 'Трансферы ожидающие вашего подтверждения' },
          { key: 'accepted', label: 'Принятые', tooltip: 'Успешно принятые трансферы' },
          { key: 'problematic', label: 'Проблемные', tooltip: 'Трансферы с расхождением в количестве' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); setSearch(''); }}
            title={tab.tooltip}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-surface-card text-content-primary'
                : 'text-content-secondary hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Search (all tabs now) ── */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          placeholder="Поиск по отправителю или получателю..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-edge bg-surface-card text-content-primary rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {error && !acceptTarget && !disagreeTarget && (
        <div className="bg-red-500/10 text-red-400 text-sm px-4 py-2.5 rounded-[var(--radius-sm)]">{error}</div>
      )}

      {/* ── PENDING TAB: Action cards ── */}
      {activeTab === 'pending' && (
        displayList.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 text-center py-6">Нет входящих отправок</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayList.map((t) => {
              const sender = getSenderName(t);
              const receiver = getReceiverName(t);
              const isAdmin = isAdminTransfer(t);
              const totalQty = getTotalQuantity(t);
              
              // Role-based button visibility
              const userIsReceiver = isUserReceiver(t);
              const userIsAdmin = user.role === 'ADMIN';
              // ADMIN can do everything, otherwise show buttons based on role
              const canAccept = userIsReceiver || userIsAdmin;
              const canReject = userIsReceiver || userIsAdmin;
              // Cancel button is ADMIN-only
              const canCancel = userIsAdmin;

              return (
                <Card key={t.id} className={getTransferCardClass(t)}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-content-muted font-mono">#{t.id?.slice(-6) || '—'}</span>
                          <Badge status={t.status} />
                          {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                        </div>
                        <div className="text-xs text-content-muted mt-0.5">
                          {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-blue-400">{sender}</span>
                      <ArrowRight size={14} className="text-content-muted flex-shrink-0" />
                      <span className="font-medium text-emerald-400">{receiver}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(t.items || []).map((item) => (
                        <BraceletBadge key={item.itemType || item.id} type={item.itemType} count={item.quantity} />
                      ))}
                      <span className="text-xs text-content-muted ml-2">Итого: {totalQty} шт</span>
                    </div>

                    {t.notes && <p className="text-xs text-content-muted">{t.notes}</p>}

                    <div className="flex gap-2 flex-wrap">
                      {/* Receiver buttons: Accept & Reject */}
                      {canAccept && (
                        <Button size="sm" variant="success" onClick={() => openAccept(t)} loading={processing} title="Подтвердить получение браслетов в указанном количестве">
                          <CheckCircle size={16} /> Принять
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                          onClick={() => openDisagree(t)}
                          title="Отклонить с указанием фактического количества"
                        >
                          <XCircle size={16} /> Отклонить
                        </Button>
                      )}
                      {/* Sender button: Cancel */}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleCancel(t)}
                          loading={processing}
                          title="Отменить отправку и вернуть браслеты на баланс"
                        >
                          <AlertTriangle size={16} /> Отменить
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ── ACCEPTED / PROBLEMATIC TAB: Read-only list ── */}
      {(activeTab === 'accepted' || activeTab === 'problematic') && (
        displayList.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 text-center py-6">
              {activeTab === 'accepted' ? 'Нет принятых отправок' : 'Нет проблемных отправок'}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayList.map((t) => {
              const totalQty = getTotalQuantity(t);
              const isExpanded = expandedId === t.id;
              const isAdmin = isAdminTransfer(t);

              return (
                <div
                  key={t.id}
                  className={`bg-surface-card rounded-[var(--radius-md)] border border-edge hover:shadow-md transition-shadow overflow-hidden ${getTransferCardClass(t)}`}
                >
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge status={t.status} />
                        {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                        <span className="text-xs text-content-muted">
                          {new Date(t.createdAt).toLocaleString('ru-RU', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="text-xs text-content-muted font-mono">#{t.id?.slice(-6) || '—'}</span>
                      </div>
                      <button
                        onClick={() => setDetailTarget(t)}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted hover:text-brand-600 transition-colors"
                        title="Подробнее"
                      >
                        <HelpCircle size={16} />
                      </button>
                    </div>

                    <div className="text-sm flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-blue-400 truncate max-w-[120px]" title={getSenderName(t)}>{getSenderName(t)}</span>
                      <ArrowRight size={14} className="text-content-muted flex-shrink-0" />
                      <span className="font-medium text-emerald-400 truncate max-w-[120px]" title={getReceiverName(t)}>{getReceiverName(t)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(t.items || []).map((item) => (
                        <BraceletBadge key={item.itemType || item.id} type={item.itemType} count={item.quantity} size="sm" />
                      ))}
                      <span className="text-xs text-content-muted ml-1">Итого: {totalQty} шт</span>
                    </div>

                    {t.notes && <p className="text-xs text-content-muted italic">{t.notes}</p>}

                    {t.rejection && (
                      <div className="bg-red-500/10 text-red-400 text-xs px-2 py-1.5 rounded-[var(--radius-sm)]">
                        Причина: {t.rejection.reason}
                      </div>
                    )}

                    {t.status === 'DISCREPANCY_FOUND' && t.acceptanceRecords?.length > 0 && (
                      <div className="bg-orange-50 rounded-[var(--radius-sm)] overflow-hidden border border-orange-100">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-orange-700 font-medium hover:bg-orange-100/50"
                        >
                          <span>Расхождение при получении</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-2 space-y-1">
                            {t.acceptanceRecords?.map((ri) => {
                              const sentItem = (t.items || []).find((si) => si.itemType === ri.itemType);
                              const diff = (ri.receivedQuantity || 0) - (sentItem?.quantity || 0);
                              return (
                                <div key={ri.itemType || ri.id} className="flex items-center justify-between text-xs">
                                  <BraceletBadge type={ri.itemType} size="sm" />
                                  <span className="text-gray-600">
                                    Отпр: {sentItem?.quantity || 0} / Получ: {ri.receivedQuantity || 0}
                                  </span>
                                  <span className={diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Pagination (non-pending tabs) ── */}
      {activeTab !== 'pending' && transfers.length > 0 && (
        <div className="space-y-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => loadTransfers(p)} />
          <div className="text-xs text-content-muted text-right">
            Показано {displayList.length} из {transfers.length}
          </div>
        </div>
      )}

      {/* ── Accept Confirmation Modal ── */}
      <Modal
        open={!!acceptTarget}
        onClose={() => setAcceptTarget(null)}
        title="Подтверждение получения"
      >
        {acceptTarget && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-[var(--radius-sm)] p-3">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <Package size={16} />
                Вам отправлены следующие браслеты:
              </p>
            </div>

            <div className="space-y-2">
              {acceptTarget.items?.map((item) => (
                <div key={item.itemType} className="flex items-center justify-between bg-gray-50 rounded-[var(--radius-sm)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <BraceletBadge type={item.itemType} />
                    <span className="text-sm font-medium text-gray-700">{ITEM_LABELS[item.itemType]}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-800">{item.quantity} шт</span>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-[var(--radius-sm)] px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Итого:</span>
              <span className="text-lg font-bold text-gray-800">
                {(acceptTarget.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} шт
              </span>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Нажимая «Да, принимаю» вы подтверждаете, что получили все браслеты в указанном количестве.
            </p>

            {error && (
              <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">{error}</div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAcceptConfirm}
                loading={processing}
                className="flex-1"
                variant="success"
              >
                <CheckCircle size={18} /> Да, принимаю
              </Button>
              <Button
                onClick={() => setAcceptTarget(null)}
                variant="ghost"
                className="flex-shrink-0"
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Disagree / Count Modal (per-color input) ── */}
      <Modal
        open={!!disagreeTarget}
        onClose={() => setDisagreeTarget(null)}
        title="Сколько браслетов вы насчитали?"
      >
        {disagreeTarget && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-[var(--radius-sm)] p-3">
              <p className="text-sm text-orange-800 flex items-center gap-2">
                <AlertTriangle size={16} />
                Укажите количество браслетов каждого цвета, которое вы фактически получили.
              </p>
            </div>

            {/* Per-color inputs */}
            <div className="space-y-3">
              {(disagreeTarget.items || []).map((item) => (
                <div key={item.itemType} className="flex items-center gap-3">
                  <BraceletBadge type={item.itemType} count={item.quantity} />
                  <span className="text-xs text-content-muted">→</span>
                  <Input
                    type="number"
                    min="0"
                    value={receivedItems[item.itemType]}
                    onChange={(e) => setReceivedItems(prev => ({ ...prev, [item.itemType]: e.target.value }))}
                    placeholder={`${item.quantity}`}
                    className="w-24 text-center"
                  />
                  <span className="text-xs text-content-muted">{ITEM_LABELS[item.itemType]}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-[var(--radius-sm)] p-3">
              <div className="flex justify-between text-sm">
                <span className="text-content-muted">Отправлено:</span>
                <span className="font-medium">{getTotalQuantity(disagreeTarget)} шт</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-content-muted">Получено:</span>
                <span className="font-medium">
                  {Object.entries(receivedItems).reduce((sum, [_, v]) => sum + (parseInt(v) || 0), 0)} шт
                </span>
              </div>
            </div>

            {(() => {
              const preview = getDisagreePreview();
              if (!preview) return null;
              const colors = {
                cancelled: 'bg-red-50 text-red-700 border-red-200',
                discrepancy: 'bg-orange-50 text-orange-700 border-orange-200',
                match: 'bg-green-50 text-green-700 border-green-200',
              };
              return (
                <div className={`text-xs px-3 py-2 rounded-[var(--radius-sm)] border ${colors[preview.type]}`}>
                  {preview.label}
                </div>
              );
            })()}

            {error && (
              <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">{error}</div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleDisagreeSubmit}
                loading={processing}
                className="flex-1"
                variant={getDisagreePreview()?.type === 'match' ? 'outline' : 'danger'}
                disabled={!Object.values(receivedItems).some(v => v !== '')}
              >
                {getDisagreePreview()?.type === 'cancelled' ? (
                  <><XCircle size={18} /> Ничего не получил</>
                ) : getDisagreePreview()?.type === 'discrepancy' ? (
                  <><AlertTriangle size={18} /> Отправить расхождение</>
                ) : (
                  <><CheckCircle size={18} /> Подтвердить</>
                )}
              </Button>
              <Button
                onClick={() => setDisagreeTarget(null)}
                variant="ghost"
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title="Детали отправки">
        {detailTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge status={detailTarget.status} />
              <span className="text-xs text-content-muted">
                {new Date(detailTarget.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>

            <div className="text-sm">
              <div className="text-xs text-content-muted mb-1">Отправитель</div>
              <div className="font-medium">{getSenderLabel(detailTarget)}</div>
              {detailTarget.createdByUser?.displayName && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {detailTarget.createdByUser.displayName}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-content-muted mb-2">Состав отправки</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-muted border-b">
                    <th className="pb-1">Цвет</th>
                    <th className="pb-1 text-right">Отправлено</th>
                    {detailTarget.acceptanceRecords?.length > 0 && (
                      <th className="pb-1 text-right">Получено</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(detailTarget.items || []).map((item) => {
                    const rec = detailTarget.acceptanceRecords?.find(
                      (ri) => ri.itemType === item.itemType
                    );
                    return (
                      <tr key={item.itemType} className="border-b border-gray-50">
                        <td className="py-1.5">
                          <BraceletBadge type={item.itemType} size="sm" />
                        </td>
                        <td className="py-1.5 text-right font-medium">{item.quantity}</td>
                        {detailTarget.acceptanceRecords?.length > 0 && (
                          <td className="py-1.5 text-right">
                            <span className={rec && rec.receivedQuantity !== item.quantity
                              ? rec.receivedQuantity > item.quantity ? 'text-blue-600 font-medium' : 'text-red-600 font-medium'
                              : 'text-green-600'
                            }>
                              {rec?.receivedQuantity ?? '—'}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {detailTarget.notes && (
              <div className="bg-gray-50 p-3 rounded-[var(--radius-sm)] text-sm text-gray-600">
                <div className="text-xs text-content-muted mb-1">Комментарий</div>
                {detailTarget.notes}
              </div>
            )}

            {detailTarget.rejection && (
              <div className="bg-red-500/10 p-3 rounded-[var(--radius-sm)] text-sm text-red-400">
                <div className="text-xs text-red-400 mb-1">Причина отклонения</div>
                {detailTarget.rejection.reason}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
