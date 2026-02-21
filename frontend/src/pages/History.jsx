import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { BraceletRow } from '../components/ui/BraceletBadge';

export default function History() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data } = await transfersApi.getAll();
      setTransfers(data.data || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? transfers
    : transfers.filter((t) => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const statusCounts = {};
  transfers.forEach((t) => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">История</h2>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `Все (${transfers.length})` },
          { key: 'SENT', label: `Отправлено (${statusCounts.SENT || 0})` },
          { key: 'ACCEPTED', label: `Принято (${statusCounts.ACCEPTED || 0})` },
          { key: 'DISCREPANCY_FOUND', label: `Расход. (${statusCounts.DISCREPANCY_FOUND || 0})` },
          { key: 'REJECTED', label: `Откл. (${statusCounts.REJECTED || 0})` },
          { key: 'CANCELLED', label: `Отм. (${statusCounts.CANCELLED || 0})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${filter === key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет записей</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.id}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge status={t.status} />
                  <span className="text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-gray-500">
                    {t.senderType === 'ADMIN' ? 'Админ' : (t.senderCity?.name || t.senderCountry?.name || t.senderType)}
                  </span>
                  <span className="mx-2 text-gray-300">→</span>
                  <span className="font-medium">{t.receiverCity?.name || t.receiverCountry?.name || t.receiverType}</span>
                </div>

                <BraceletRow items={t.items} size="sm" />

                {t.notes && <p className="text-xs text-gray-400">{t.notes}</p>}

                {t.rejection && (
                  <div className="bg-red-50 text-red-600 text-xs px-2 py-1 rounded">
                    Причина: {t.rejection.reason}
                  </div>
                )}

                {t.status === 'DISCREPANCY_FOUND' && t.acceptanceRecords?.length > 0 && (
                  <div className="bg-orange-50 text-orange-700 text-xs px-2 py-1 rounded">
                    Расхождение в приёмке
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
