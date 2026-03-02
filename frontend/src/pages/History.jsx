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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('completed'); // 'completed' | 'pending' | 'problematic'

  useEffect(() => {
    loadHistory();
  }, [activeTab]);

  const loadHistory = async (p = 1) => {
    setLoading(true);
    try {
      const params = {
        page: p,
        limit: 30,
        direction: 'received', // Only transfers received by current user's entity
      };

      // Tab-based status filtering
      if (activeTab === 'completed') params.status = 'ACCEPTED';
      else if (activeTab === 'pending') params.status = 'SENT';
      // 'problematic' — we'll load all and filter client-side for DISCREPANCY_FOUND + REJECTED + CANCELLED

      if (activeTab === 'problematic') {
        // Load without status filter, then filter client-side
        delete params.status;
      }

      const { data } = await transfersApi.getAll(params);
      const payload = data?.data || data;
      const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
      
      setTransfers(list);
      const meta = data?.meta || payload?.meta;
      setTotalPages(meta?.totalPages || 1);
      setPage(meta?.page || p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const displayList = useMemo(() => {
    let list = [...transfers];

    // For "problematic" tab: filter to only DISCREPANCY_FOUND + REJECTED + CANCELLED
    if (activeTab === 'problematic') {
      list = list.filter((t) =>
        ['DISCREPANCY_FOUND', 'REJECTED', 'CANCELLED'].includes(t.status)
      );
    }

    // Client-side search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.senderCity?.name || '').toLowerCase().includes(q) ||
        (t.senderCountry?.name || '').toLowerCase().includes(q) ||
        (t.createdByUser?.displayName || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter((t) => new Date(t.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((t) => new Date(t.createdAt) <= to);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return list;
  }, [transfers, activeTab, search, dateFrom, dateTo]);

  const getSenderLabel = (t) => {
    if (t.senderType === 'ADMIN') return 'Склад';
    if (t.senderType === 'OFFICE') return t.senderOffice?.name || 'Офис';
    if (t.senderType === 'CITY') {
      const city = t.senderCity?.name || '—';
      const country = t.senderCity?.country?.name;
      return country ? `${city} (${country})` : city;
    }
    return t.senderCountry?.name || t.senderType;
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
      {/* ── Header ────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">Входящие</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Отправки, адресованные вам
        </p>
      </div>

      {/* ── Tabs: Завершённые / Не завершённые / Проблемные ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'completed', label: 'Завершённые' },
          { key: 'pending', label: 'Не завершённые' },
          { key: 'problematic', label: 'Проблемные' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по отправителю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 items-center">
          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ── Transfers List ────────────────────────────── */}
      {displayList.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            {activeTab === 'completed' && 'Нет завершённых входящих'}
            {activeTab === 'pending' && 'Нет ожидающих входящих'}
            {activeTab === 'problematic' && 'Нет проблемных отправок'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayList.map((t) => {
            const totalQty = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            const isExpanded = expandedId === t.id;
            const senderName = t.createdByUser?.displayName;

            return (
              <div
                key={t.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge status={t.status} />
                      <span className="text-xs text-gray-400">
                        {new Date(t.createdAt).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span className="text-xs text-gray-300 font-mono">
                        #{t.id?.slice(-6) || '—'}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelected(t)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                      title="Подробнее"
                    >
                      <Eye size={16} />
                    </button>
                  </div>

                  {/* Sender (from) */}
                  <div className="text-sm flex items-center gap-1.5">
                    <span className="text-gray-300 flex-shrink-0">от</span>
                    <span className="font-medium text-gray-800 truncate">{getSenderLabel(t)}</span>
                  </div>

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

                  {t.notes && <p className="text-xs text-gray-400 italic">{t.notes}</p>}

                  {t.rejection && (
                    <div className="bg-red-50 text-red-600 text-xs px-2 py-1.5 rounded-lg">
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
      )}

      {/* ── Pagination ────────────────────────────────── */}
      {transfers.length > 0 && (
        <div className="space-y-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => loadHistory(p)} />
          <div className="text-xs text-gray-400 text-right">
            Показано {displayList.length} из {transfers.length}
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Детали отправки">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge status={selected.status} />
              <span className="text-xs text-gray-400">
                {new Date(selected.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>

            <div className="text-sm">
              <div className="text-xs text-gray-400 mb-1">Отправитель</div>
              <div className="font-medium">{getSenderLabel(selected)}</div>
              {selected.createdByUser?.displayName && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {selected.createdByUser.displayName}
                </div>
              )}
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
                    const rec = selected.acceptanceRecords?.find(
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
