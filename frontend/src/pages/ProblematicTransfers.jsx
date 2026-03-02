import { useState, useEffect } from 'react';
import { AlertTriangle, Eye, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Pagination from '../components/ui/Pagination';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

const ITEM_COLORS = {
  BLACK: { label: 'Чёрный', bg: 'bg-gray-800', text: 'text-white' },
  WHITE: { label: 'Белый', bg: 'bg-gray-100', text: 'text-gray-800', border: 'border border-gray-300' },
  RED: { label: 'Красный', bg: 'bg-red-500', text: 'text-white' },
  BLUE: { label: 'Синий', bg: 'bg-blue-500', text: 'text-white' },
};

function entityLabel(transfer, prefix) {
  const type = transfer[`${prefix}Type`];
  if (type === 'ADMIN') return 'Админ';
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

export default function ProblematicTransfers() {
  const { user } = useAuthStore();
  const canResolve = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [resolving, setResolving] = useState(false);

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await transfersApi.getProblematic({ page: p, limit: 20 });
      const payload = data?.data || data;
      const list = Array.isArray(payload) ? payload : [];
      setTransfers(list);
      const meta = data?.meta || payload?.meta;
      setTotalPages(meta?.totalPages || 1);
      setPage(meta?.page || p);
    } catch (err) {
      console.error('Failed to fetch problematic transfers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResolve = async (transferId, action) => {
    const msg = action === 'accept_received'
      ? 'Принять как есть? Получателю зачислится то что он насчитал.'
      : 'Отменить трансфер? Опаски вернутся отправителю, получателю ничего не зачислится.';
    if (!confirm(msg)) return;
    setResolving(true);
    try {
      await transfersApi.resolveDiscrepancy(transferId, action);
      setSelectedTransfer(null);
      await fetchData(page);
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="text-amber-500" size={24} />
        <h2 className="text-lg font-bold text-gray-800">Проблемные трансферы</h2>
        <span className="text-sm text-gray-400">Расхождения при приёмке</span>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
        </div>
      )}

      {!loading && transfers.length === 0 && (
        <Card className="text-center py-12 text-gray-400">
          Нет проблемных трансферов
        </Card>
      )}

      {!loading && transfers.length > 0 && (
        <div className="grid gap-3">
          {transfers.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <span className="font-semibold text-gray-800 text-sm">
                      {entityLabel(t, 'sender')}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold text-gray-800 text-sm">
                      {entityLabel(t, 'receiver')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Отправитель: {t.createdByUser?.displayName || '—'}</span>
                    <span className="text-gray-300">|</span>
                    <span>{formatDate(t.createdAt)}</span>
                  </div>

                  {/* Color breakdown */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {t.items?.map((item) => (
                      <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="warning">Расхождение</Badge>
                  {canResolve && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleResolve(t.id, 'accept_received')}
                        disabled={resolving}
                        title="Принять как есть"
                      >
                        <CheckCircle size={14} /> Принять
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleResolve(t.id, 'cancel')}
                        disabled={resolving}
                        title="Отменить трансфер"
                      >
                        <XCircle size={14} /> Отменить
                      </Button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedTransfer(t)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                    title="Подробнее"
                  >
                    <Eye size={18} />
                  </button>
                </div>
              </div>

              {/* Discrepancy summary */}
              {t.acceptanceRecords?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {t.acceptanceRecords
                      .filter((r) => r.discrepancy !== 0)
                      .map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
                        >
                          <span className={`w-3 h-3 rounded-full ${ITEM_COLORS[r.itemType]?.bg || 'bg-gray-300'}`} />
                          <span className="font-medium">{ITEM_COLORS[r.itemType]?.label}</span>
                          <span className="text-amber-700">
                            отпр. {r.sentQuantity} / получ. {r.receivedQuantity}
                          </span>
                          <span className={`font-bold ${r.discrepancy > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {r.discrepancy > 0 ? `-${r.discrepancy}` : `+${Math.abs(r.discrepancy)}`}
                          </span>
                        </div>
                      ))}
                  </div>
                  {t.acceptanceRecords[0]?.acceptedBy && (
                    <p className="text-xs text-gray-400 mt-2">
                      Принял: {t.acceptanceRecords[0].acceptedBy.displayName}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}

          <Pagination page={page} totalPages={totalPages} onPageChange={fetchData} />
        </div>
      )}

      {/* Detail modal */}
      {selectedTransfer && (
        <Modal
          title="Детали проблемного трансфера"
          onClose={() => setSelectedTransfer(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Откуда</p>
                <p className="font-medium">{entityLabel(selectedTransfer, 'sender')}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Куда</p>
                <p className="font-medium">{entityLabel(selectedTransfer, 'receiver')}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Отправитель</p>
                <p className="font-medium">{selectedTransfer.createdByUser?.displayName || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Дата отправки</p>
                <p className="font-medium">{formatDate(selectedTransfer.createdAt)}</p>
              </div>
            </div>

            {selectedTransfer.notes && (
              <div>
                <p className="text-gray-400 text-xs">Заметки</p>
                <p className="text-sm">{selectedTransfer.notes}</p>
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs mb-2">Расхождения</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-xs">
                    <th className="text-left py-1.5">Цвет</th>
                    <th className="text-center py-1.5">Отправлено</th>
                    <th className="text-center py-1.5">Получено</th>
                    <th className="text-center py-1.5">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransfer.acceptanceRecords?.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-1.5 flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${ITEM_COLORS[r.itemType]?.bg || 'bg-gray-300'}`} />
                        {ITEM_COLORS[r.itemType]?.label}
                      </td>
                      <td className="text-center">{r.sentQuantity}</td>
                      <td className="text-center">{r.receivedQuantity}</td>
                      <td className={`text-center font-bold ${
                        r.discrepancy > 0 ? 'text-red-600' : r.discrepancy < 0 ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {r.discrepancy === 0 ? '—' : r.discrepancy > 0 ? `-${r.discrepancy}` : `+${Math.abs(r.discrepancy)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedTransfer.acceptanceRecords?.[0]?.acceptedBy && (
              <p className="text-xs text-gray-400">
                Принял: {selectedTransfer.acceptanceRecords[0].acceptedBy.displayName}
                {' '} — {formatDate(selectedTransfer.acceptanceRecords[0].createdAt)}
              </p>
            )}

            {canResolve && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button
                  variant="success"
                  onClick={() => handleResolve(selectedTransfer.id, 'accept_received')}
                  disabled={resolving}
                  className="flex-1"
                >
                  <CheckCircle size={16} /> Принять как есть
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleResolve(selectedTransfer.id, 'cancel')}
                  disabled={resolving}
                  className="flex-1"
                >
                  <XCircle size={16} /> Отменить трансфер
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
