import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, HelpCircle, CheckCircle, XCircle, 
  UserCheck, Users, Scale, ShieldAlert, RefreshCw,
  ArrowRight, TrendingDown, Lock, Search, MinusCircle
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { transfersApi } from '../api/transfers';
import { inventoryApi } from '../api/inventory';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Pagination from '../components/ui/Pagination';
import Modal, { TwoFactorModal } from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';

const ITEM_COLORS = {
  BLACK: { label: 'Чёрный', bg: 'bg-gray-800', text: 'text-white' },
  WHITE: { label: 'Белый', bg: 'bg-gray-100', text: 'text-gray-800', border: 'border border-gray-300' },
  RED: { label: 'Красный', bg: 'bg-red-500', text: 'text-white' },
  BLUE: { label: 'Синий', bg: 'bg-blue-500', text: 'text-white' },
};

// Resolution types matching backend enum
const RESOLUTION_TYPES = {
  ACCEPT_SENDER: {
    key: 'ACCEPT_SENDER',
    label: 'Принять сторону отправителя',
    shortLabel: 'От отправителя',
    icon: UserCheck,
    description: 'Верим отправителю — он отправил правильное количество. Получателю зачисляется полная сумма отправителя. Недостача записывается на аккаунт получателя.',
    color: 'bg-blue-500 hover:bg-blue-600',
    textColor: 'text-blue-400',
    hasCompanyLoss: false,
  },
  ACCEPT_RECEIVER: {
    key: 'ACCEPT_RECEIVER', 
    label: 'Принять сторону получателя',
    shortLabel: 'От получателя',
    icon: UserCheck,
    description: 'Верим получателю — он получил именно столько, сколько насчитал. Недостача записывается на аккаунт отправителя.',
    color: 'bg-orange-500 hover:bg-orange-600',
    textColor: 'text-orange-400',
    hasCompanyLoss: false,
  },
  ACCEPT_COMPROMISE: {
    key: 'ACCEPT_COMPROMISE',
    label: 'Компромисс',
    shortLabel: 'Компромисс',
    icon: Scale,
    description: 'Обе стороны несут ответственность. Получатель получит сколько насчитал. Расхождение записывается на оба аккаунта.',
    color: 'bg-amber-500 hover:bg-amber-600',
    textColor: 'text-amber-400',
    hasCompanyLoss: false,
  },
  ACCEPT_AS_IS: {
    key: 'ACCEPT_AS_IS',
    label: 'Принять как есть',
    shortLabel: 'Как есть',
    icon: ShieldAlert,
    description: 'Никто не виноват. Получатель получит сколько насчитал. Разница списывается на компанию.',
    color: 'bg-red-500 hover:bg-red-600',
    textColor: 'text-red-400',
    hasCompanyLoss: true,
  },
};

function entityLabel(transfer, prefix) {
  const type = transfer[`${prefix}Type`];
  // For ADMIN sender, show the created by user's name if available
  if (type === 'ADMIN') {
    if (prefix === 'sender' && transfer.createdByUser) {
      return transfer.createdByUser.displayName || transfer.createdByUser.username || 'Админ';
    }
    return 'Админ';
  }
  if (type === 'OFFICE') {
    const o = transfer[`${prefix}Office`];
    return o?.name || 'Офис';
  }
  if (type === 'COUNTRY') {
    const c = transfer[`${prefix}Country`];
    return c?.name || '—';
  }
  if (type === 'CITY') {
    const city = transfer[`${prefix}City`];
    const country = city?.country;
    return country ? `${city?.name} (${country.name})` : city?.name || '—';
  }
  return '—';
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Calculate company loss for a resolution type
// Only ACCEPT_AS_IS creates company loss
function calculateLoss(transfer, resolutionType, compromiseValues = {}) {
  const loss = { black: 0, white: 0, red: 0, blue: 0, total: 0 };
  
  if (!transfer?.acceptanceRecords) return loss;
  
  // Only ACCEPT_AS_IS creates company loss
  if (resolutionType !== 'ACCEPT_AS_IS') {
    return loss;
  }
  
  transfer.acceptanceRecords.forEach((r) => {
    const sent = r.sentQuantity || 0;
    const received = r.receivedQuantity || 0;
    const itemKey = r.itemType.toLowerCase();
    const diff = Math.max(0, sent - received);
    
    if (loss[itemKey] !== undefined) {
      loss[itemKey] = diff;
      loss.total += diff;
    }
  });
  
  return loss;
}

export default function ProblematicTransfers() {
  const { user } = useAuthStore();
  const { countryId, cityId } = useFilterStore();
  const navigate = useNavigate();
  const canResolve = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lossSummary, setLossSummary] = useState(null);
  
  // Detail/Resolution modal
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [selectedResolution, setSelectedResolution] = useState(null);
  const [compromiseValues, setCompromiseValues] = useState({});
  
  // 2FA Modal
  const [show2FA, setShow2FA] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  
  // Search
  const [search, setSearch] = useState('');

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (countryId) params.countryId = countryId;
      if (cityId) params.cityId = cityId;
      
      const [transfersRes, lossRes] = await Promise.all([
        transfersApi.getProblematic(params),
        canResolve ? inventoryApi.getCompanyLossesSummary() : Promise.resolve(null),
      ]);
      
      const data = transfersRes.data;
      const payload = data?.data || data;
      const list = Array.isArray(payload) ? payload : [];
      setTransfers(list);
      const meta = data?.meta || payload?.meta;
      setTotalPages(meta?.totalPages || 1);
      setPage(meta?.page || p);
      
      if (lossRes) {
        const lossData = lossRes.data;
        setLossSummary(lossData?.data || lossData);
      }
    } catch (err) {
      console.error('Failed to fetch problematic transfers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [countryId, cityId]);

  // Open resolution modal for a transfer
  const openResolveModal = (transfer) => {
    setSelectedTransfer(transfer);
    setSelectedResolution(null);
    setResolveError('');
    // Initialize compromise values with received quantities
    const initValues = {};
    transfer.acceptanceRecords?.forEach((r) => {
      initValues[r.itemType] = r.receivedQuantity || 0;
    });
    setCompromiseValues(initValues);
  };

  // Select a resolution type and show 2FA
  const selectResolution = (resType) => {
    setSelectedResolution(resType);
    setResolveError('');
  };

  // Initiate 2FA confirmation
  const initiate2FA = () => {
    if (!selectedResolution) return;
    setShow2FA(true);
  };

  // Handle 2FA confirmation and resolve
  const handleResolveConfirm = async (password) => {
    if (!selectedTransfer || !selectedResolution) return;
    
    setResolving(true);
    setResolveError('');
    
    try {
      const payload = {
        resolutionType: selectedResolution,
        password, // 2FA password for verification
      };
      
      // For compromise, include the adjusted values
      if (selectedResolution === 'ACCEPT_COMPROMISE') {
        payload.compromiseValues = compromiseValues;
      }
      
      await transfersApi.resolveDiscrepancy(selectedTransfer.id, payload);
      
      setShow2FA(false);
      setSelectedTransfer(null);
      setSelectedResolution(null);
      await fetchData(page);
    } catch (err) {
      const message = err.response?.data?.message || 'Ошибка разрешения';
      setResolveError(message);
      throw new Error(message); // Re-throw for TwoFactorModal to handle
    } finally {
      setResolving(false);
    }
  };

  // Calculate consequences for the selected resolution
  const consequences = useMemo(() => {
    if (!selectedTransfer || !selectedResolution) return null;
    return calculateLoss(selectedTransfer, selectedResolution, compromiseValues);
  }, [selectedTransfer, selectedResolution, compromiseValues]);

  // Build consequences description based on resolution type
  const getConsequencesDescription = () => {
    if (!selectedTransfer || !selectedResolution) return [];
    
    const items = [];
    const res = RESOLUTION_TYPES[selectedResolution];
    const senderName = getSenderName(selectedTransfer);
    const receiverName = getReceiverName(selectedTransfer);
    
    const totalSent = selectedTransfer.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
    const totalReceived = selectedTransfer.acceptanceRecords?.reduce((s, r) => s + (r.receivedQuantity || 0), 0) || 0;
    const totalDiff = totalSent - totalReceived;
    
    if (selectedResolution === 'ACCEPT_SENDER') {
      items.push(`• ${senderName}: списано ${totalSent} шт ✓`);
      items.push(`• ${receiverName}: зачислено ${totalSent} шт (полная сумма)`);
      if (totalDiff > 0) {
        items.push(`• Недостача ${receiverName}: ${totalDiff} шт ⚠️`);
      }
      items.push(`• Минус компании: 0 шт`);
    } else if (selectedResolution === 'ACCEPT_RECEIVER') {
      items.push(`• ${senderName}: списано ${totalSent} шт, недостача ${totalDiff} шт ⚠️`);
      items.push(`• ${receiverName}: зачислено ${totalReceived} шт ✓`);
      items.push(`• Минус компании: 0 шт`);
    } else if (selectedResolution === 'ACCEPT_COMPROMISE') {
      items.push(`• ${senderName}: списано ${totalSent} шт, участник расхождения ⚠️`);
      items.push(`• ${receiverName}: зачислено ${totalReceived} шт, участник расхождения ⚠️`);
      items.push(`• Минус компании: 0 шт`);
    } else if (selectedResolution === 'ACCEPT_AS_IS') {
      items.push(`• ${senderName}: списано ${totalSent} шт ✓`);
      items.push(`• ${receiverName}: зачислено ${totalReceived} шт ✓`);
      items.push(`• Минус компании: ${totalDiff} шт 📉`);
    }
    
    return items;
  };

  // Filter transfers by search
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="text-amber-500" size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-content-primary">Проблемные отправки</h2>
            <p className="text-sm text-content-muted">{filteredTransfers.length} расхождений требуют решения</p>
          </div>
        </div>
        <button
          onClick={() => fetchData(page)}
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

      {/* Company Losses Banner (ADMIN/OFFICE only) */}
      {canResolve && lossSummary && lossSummary.totalQuantity > 0 && (
        <div
          onClick={() => navigate('/company-losses')}
          className="flex items-center justify-between p-4 bg-red-500/10 rounded-xl border border-red-500/30 cursor-pointer hover:bg-red-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <MinusCircle size={20} className="text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold text-red-400">Минус компании</h4>
              <p className="text-xs text-content-muted">Всего потеряно: {lossSummary.totalQuantity} браслетов</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-red-400" />
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
        </div>
      )}

      {!loading && filteredTransfers.length === 0 && (
        <Card className="text-center py-12 text-gray-400">
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={48} className="text-emerald-500/50" />
            <p>Нет проблемных отправок</p>
            <p className="text-xs">Все расхождения разрешены</p>
          </div>
        </Card>
      )}

      {!loading && filteredTransfers.length > 0 && (
        <div className="grid gap-3">
          {filteredTransfers.map((t) => {
            const totalSent = getTotalQuantity(t);
            const totalReceived = t.acceptanceRecords?.reduce((s, r) => s + (r.receivedQuantity || 0), 0) || 0;
            const totalDiff = totalSent - totalReceived;
            const isAdmin = isAdminTransfer(t);
            
            return (
              <div
                key={t.id}
                className={`bg-surface-card rounded-xl border border-amber-500/30 hover:border-amber-500/50 transition-all overflow-hidden ${getTransferCardClass(t)}`}
              >
                <div className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Transfer info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <AlertTriangle size={16} className="text-amber-500" />
                        <span className="text-xs text-content-muted font-mono">
                          #{t.id?.slice(-6)}
                        </span>
                        {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-blue-400">
                          {getSenderName(t)}
                        </span>
                        <ArrowRight size={14} className="text-content-muted" />
                        <span className="font-medium text-emerald-400">
                          {getReceiverName(t)}
                        </span>
                      </div>

                      <div className="text-xs text-content-muted">
                        {formatDate(t.createdAt)}
                      </div>

                      {/* Bracelet breakdown with discrepancy */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.acceptanceRecords?.map((r) => {
                          const diff = (r.sentQuantity || 0) - (r.receivedQuantity || 0);
                          return (
                            <div key={r.itemType} className="flex items-center gap-1">
                              <BraceletBadge type={r.itemType} count={r.sentQuantity} />
                              {diff !== 0 && (
                                <span className={`text-xs font-bold ${diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  ({diff > 0 ? `-${diff}` : `+${Math.abs(diff)}`})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Total discrepancy indicator */}
                      {totalDiff !== 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingDown size={14} className="text-red-400" />
                          <span className="text-red-400 font-medium">
                            Недостача: {totalDiff} шт
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="warning">Расхождение</Badge>
                      {canResolve && (
                        <Button
                          size="sm"
                          onClick={() => openResolveModal(t)}
                          className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                          <Lock size={14} className="mr-1" /> Решить
                        </Button>
                      )}
                      <button
                        onClick={() => setSelectedTransfer(t)}
                        className="p-2 rounded-lg hover:bg-surface-card-hover text-content-muted"
                        title="Подробнее"
                      >
                        <HelpCircle size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick discrepancy summary */}
                {t.acceptanceRecords?.some(r => r.discrepancy !== 0) && (
                  <div className="bg-amber-500/5 border-t border-amber-500/20 px-4 py-2">
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      {t.acceptanceRecords.filter(r => r.discrepancy !== 0).map((r) => (
                        <div key={r.itemType} className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${ITEM_COLORS[r.itemType]?.bg}`} />
                          <span className="text-content-muted">{ITEM_COLORS[r.itemType]?.label}:</span>
                          <span className="text-content-secondary">отпр. {r.sentQuantity}</span>
                          <span className="text-content-muted">/</span>
                          <span className="text-content-secondary">получ. {r.receivedQuantity}</span>
                          <span className={`font-bold ${r.discrepancy > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            ({r.discrepancy > 0 ? `-${r.discrepancy}` : `+${Math.abs(r.discrepancy)}`})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Pagination page={page} totalPages={totalPages} onPageChange={fetchData} />
        </div>
      )}

      {/* Resolution Modal */}
      <Modal
        open={!!selectedTransfer && !show2FA}
        onClose={() => { setSelectedTransfer(null); setSelectedResolution(null); }}
        title="Разрешение расхождения"
        size="lg"
      >
        {selectedTransfer && (
          <div className="space-y-6">
            {/* Transfer summary */}
            <div className="bg-surface-primary rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-blue-400">{entityLabel(selectedTransfer, 'sender')}</span>
                <ArrowRight size={14} className="text-content-muted" />
                <span className="font-medium text-emerald-400">{entityLabel(selectedTransfer, 'receiver')}</span>
              </div>
              
              <div className="text-xs text-content-muted">
                {formatDate(selectedTransfer.createdAt)} · #{selectedTransfer.id?.slice(-6)}
              </div>

              {/* Discrepancy table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-content-muted border-b border-edge">
                    <th className="text-left py-2">Цвет</th>
                    <th className="text-center py-2">Отправлено</th>
                    <th className="text-center py-2">Получено</th>
                    <th className="text-center py-2">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransfer.acceptanceRecords?.map((r) => (
                    <tr key={r.itemType} className="border-b border-edge/50">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${ITEM_COLORS[r.itemType]?.bg}`} />
                          <span>{ITEM_COLORS[r.itemType]?.label}</span>
                        </div>
                      </td>
                      <td className="text-center text-content-secondary">{r.sentQuantity}</td>
                      <td className="text-center text-content-secondary">{r.receivedQuantity}</td>
                      <td className={`text-center font-bold ${
                        r.discrepancy > 0 ? 'text-red-400' : r.discrepancy < 0 ? 'text-emerald-400' : 'text-content-muted'
                      }`}>
                        {r.discrepancy === 0 ? '—' : r.discrepancy > 0 ? `-${r.discrepancy}` : `+${Math.abs(r.discrepancy)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resolution options */}
            {canResolve && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-content-primary">Выберите способ разрешения:</h4>
                
                <div className="grid gap-3">
                  {Object.values(RESOLUTION_TYPES).map((res) => {
                    const Icon = res.icon;
                    const isSelected = selectedResolution === res.key;
                    const lossPreview = calculateLoss(selectedTransfer, res.key, compromiseValues);
                    
                    return (
                      <button
                        key={res.key}
                        onClick={() => selectResolution(res.key)}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          isSelected 
                            ? 'border-brand-500 bg-brand-500/10' 
                            : 'border-edge hover:border-brand-500/50 bg-surface-card'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            isSelected ? 'bg-brand-500 text-white' : 'bg-surface-primary text-content-muted'
                          }`}>
                            <Icon size={20} />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-content-primary">{res.label}</div>
                            <div className="text-xs text-content-muted mt-0.5">{res.description}</div>
                            {lossPreview.total > 0 && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-red-400">
                                <TrendingDown size={12} />
                                <span>Убыток: {lossPreview.total} шт</span>
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <CheckCircle size={20} className="text-brand-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Compromise value inputs */}
                {selectedResolution === 'ACCEPT_COMPROMISE' && (
                  <div className="bg-surface-primary rounded-xl p-4 space-y-3">
                    <h5 className="text-sm font-medium text-content-primary">Укажите количество для зачисления:</h5>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTransfer.acceptanceRecords?.map((r) => (
                        <div key={r.itemType} className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${ITEM_COLORS[r.itemType]?.bg}`} />
                          <span className="text-sm flex-1">{ITEM_COLORS[r.itemType]?.label}</span>
                          <Input
                            type="number"
                            min="0"
                            max={Math.max(r.sentQuantity, r.receivedQuantity)}
                            value={compromiseValues[r.itemType] || ''}
                            onChange={(e) => setCompromiseValues({
                              ...compromiseValues,
                              [r.itemType]: parseInt(e.target.value) || 0
                            })}
                            className="w-20 text-center"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-content-muted">
                      Минимум: полученное ({selectedTransfer.acceptanceRecords?.reduce((s,r) => s + r.receivedQuantity, 0)}),
                      Максимум: отправленное ({selectedTransfer.items?.reduce((s,i) => s + i.quantity, 0)})
                    </p>
                  </div>
                )}

                {/* Confirm button */}
                {selectedResolution && (
                  <div className="flex gap-3 pt-3 border-t border-edge">
                    <Button
                      onClick={initiate2FA}
                      className={RESOLUTION_TYPES[selectedResolution].color + ' text-white flex-1'}
                    >
                      <Lock size={16} className="mr-1" />
                      Подтвердить решение
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedResolution(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                )}

                {resolveError && (
                  <div className="bg-red-500/10 text-red-400 text-sm px-4 py-2 rounded-lg">
                    {resolveError}
                  </div>
                )}
              </div>
            )}

            {!canResolve && (
              <div className="bg-amber-500/10 text-amber-400 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                <Lock size={16} />
                Только ADMIN или OFFICE могут разрешать расхождения
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 2FA Confirmation Modal */}
      <TwoFactorModal
        open={show2FA}
        onClose={() => setShow2FA(false)}
        onConfirm={handleResolveConfirm}
        title="Подтверждение операции"
        description="Для разрешения расхождения введите ваш пароль"
        consequences={getConsequencesDescription()}
        loading={resolving}
      />
    </div>
  );
}
