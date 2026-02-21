import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { Search, Calendar, ChevronDown, ChevronUp, Eye } from 'lucide-react';

export default function History() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadHistory();
  }, [page, filter]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter !== 'all') params.status = filter;
      const { data } = await transfersApi.getAll(params);
      const payload = data?.data || data;
      const list = Array.isArray(payload) ? payload : (payload?.items || []);
      setTransfers(list);
      setTotalPages(payload?.totalPages || data?.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const displayList = useMemo(() => {
    let list = transfers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.senderCity?.name || '').toLowerCase().includes(q) ||
        (t.senderCountry?.name || '').toLowerCase().includes(q) ||
        (t.receiverCity?.name || '').toLowerCase().includes(q) ||
        (t.receiverCountry?.name || '').toLowerCase().includes(q) ||
        (t.createdByUser?.displayName || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter((t) => new Date(t.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((t) => new Date(t.createdAt) <= to);
    }
    return list;
  }, [transfers, search, dateFrom, dateTo]);

  const statusCounts = useMemo(() => {
    const counts = {};
    transfers.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [transfers]);

  const getSenderLabel = (t) => {
    if (t.senderType === 'ADMIN') return 'Склад';
    if (t.senderType === 'CITY') {
      const city = t.senderCity?.name || '—';
      const country = t.senderCity?.country?.name;
      return country ? `${city} (${country})` : city;
    }
    return t.senderCountry?.name || t.senderType;
  };

  const getReceiverLabel = (t) => {
    if (t.receiverType === 'CITY') {
      const city = t.receiverCity?.name || '—';
      const country = t.receiverCity?.country?.name;
      return country ? `${city} (${country})` : city;
    }
    return t.receiverCountry?.name || t.receiverType;
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
      <h2 className="text-xl font-bold text-gray-800">История</h2>

      {/* Search + date filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по городу, стране, отправителю…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 items-center">
            <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
            <span className="text-gray-400 text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
          </div>
        </div>
      </Card>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'Все' },
          { key: 'SENT', label: 'Отправлено' },
          { key: 'ACCEPTED', label: 'Принято' },
          { key: 'DISCREPANCY_FOUND', label: 'Расхождение' },
          { key: 'REJECTED', label: 'Отклонено' },
          { key: 'CANCELLED', label: 'Отменено' },
        ].map(({ key, label }) => {
          const count = key === 'all' ? transfers.length : (statusCounts[key] || 0);
          return (
            <button
              key={key}
              onClick={() => { setFilter(key); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${filter === key
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {displayList.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет записей</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayList.map((t) => {
            const totalQty = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            const isExpanded = expandedId === t.id;
            const senderName = t.createdByUser?.displayName;

            return (
              <Card key={t.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge status={t.status} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {new Date(t.createdAt).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <button
                        onClick={() => setSelected(t)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600"
                        title="Подробнее"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Sender → Receiver */}
                  <div className="text-sm">
                    <span className="text-gray-500">{getSenderLabel(t)}</span>
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-medium">{getReceiverLabel(t)}</span>
                  </div>

                  {/* Sender name */}
                  {senderName && (
                    <div className="text-xs text-gray-400">
                      Отправитель: <span className="text-gray-600 font-medium">{senderName}</span>
                    </div>
                  )}

                  {/* Color breakdown */}
                  <div className="flex items-center gap-1.5">
                    {(t.items || []).map((item) => (
                      <BraceletBadge key={item.itemType || item.id} type={item.itemType} count={item.quantity} size="sm" />
                    ))}
                    <span className="text-xs text-gray-400 ml-1">{totalQty} шт</span>
                  </div>

                  {t.notes && <p className="text-xs text-gray-400 italic">💬 {t.notes}</p>}

                  {t.rejection && (
                    <div className="bg-red-50 text-red-600 text-xs px-2 py-1 rounded">
                      Причина отклонения: {t.rejection.reason}
                    </div>
                  )}

                  {/* Discrepancy details expandable */}
                  {t.status === 'DISCREPANCY_FOUND' && t.acceptanceRecords?.length > 0 && (
                    <div className="bg-orange-50 rounded-lg overflow-hidden border border-orange-100">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-orange-700 font-medium hover:bg-orange-100/50"
                      >
                        <span>Расхождение при приёмке</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-2 space-y-1">
                          {t.acceptanceRecords[0]?.items?.map((ri) => {
                            const sentItem = (t.items || []).find((si) => si.itemType === ri.itemType);
                            const diff = (ri.receivedQuantity || 0) - (sentItem?.quantity || 0);
                            return (
                              <div key={ri.itemType} className="flex items-center justify-between text-xs">
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
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Детали трансфера">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge status={selected.status} />
              <span className="text-xs text-gray-400">
                {new Date(selected.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-400 mb-1">Откуда</div>
                <div className="font-medium">{getSenderLabel(selected)}</div>
                {selected.createdByUser?.displayName && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Отправитель: {selected.createdByUser.displayName}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Куда</div>
                <div className="font-medium">{getReceiverLabel(selected)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-400 mb-2">Состав отправки</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-1">Цвет</th>
                    <th className="pb-1 text-right">Отправлено</th>
                    {selected.acceptanceRecords?.length > 0 && (
                      <th className="pb-1 text-right">Получено</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((item) => {
                    const rec = selected.acceptanceRecords?.[0]?.items?.find(
                      (ri) => ri.itemType === item.itemType
                    );
                    return (
                      <tr key={item.itemType} className="border-b border-gray-50">
                        <td className="py-1.5">
                          <BraceletBadge type={item.itemType} count={item.quantity} size="sm" />
                        </td>
                        <td className="py-1.5 text-right font-medium">{item.quantity}</td>
                        {selected.acceptanceRecords?.length > 0 && (
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

            {selected.notes && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
                <div className="text-xs text-gray-400 mb-1">Комментарий</div>
                {selected.notes}
              </div>
            )}

            {selected.rejection && (
              <div className="bg-red-50 p-3 rounded-lg text-sm text-red-600">
                <div className="text-xs text-red-400 mb-1">Причина отклонения</div>
                {selected.rejection.reason}
              </div>
            )}

            {selected.acceptanceRecords?.[0]?.acceptedBy && (
              <div className="text-xs text-gray-400">
                Принял: <span className="text-gray-600">{selected.acceptanceRecords[0].acceptedBy.displayName}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
