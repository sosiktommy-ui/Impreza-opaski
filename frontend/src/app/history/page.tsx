'use client';

import { useEffect, useState, useCallback } from 'react';
import { transfersApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ItemBadge from '@/components/ui/ItemBadge';
import Select from '@/components/ui/Select';
import { STATUS_COLORS, formatDate } from '@/lib/utils';
import type { Transfer } from '@/lib/types';

export default function HistoryPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: limit.toString(),
      };
      if (statusFilter) params.status = statusFilter;

      const res = await transfersApi.getAll(params);
      const data = res.data.data;
      setTransfers(data?.data || data || []);
      setTotal(data?.meta?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">История трансферов</h1>
        <p className="text-dark-200 mt-1">Полный журнал всех операций трансферов</p>
      </div>

      <div className="flex gap-4">
        <div className="w-56">
          <Select
            options={[
              { value: 'ACCEPTED', label: 'Принят' },
              { value: 'DISCREPANCY_FOUND', label: 'Расхождение' },
              { value: 'REJECTED', label: 'Отклонён' },
              { value: 'CANCELLED', label: 'Отменён' },
              { value: 'SENT', label: 'Отправлен' },
              { value: 'DRAFT', label: 'Черновик' },
            ]}
            placeholder="Все статусы"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : transfers.length === 0 ? (
          <p className="text-dark-300 text-sm p-6 text-center">История не найдена</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600 bg-dark-700/50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Откуда</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Куда</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Предметы</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Статус</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-dark-700/50 transition-colors">
                      <td className="px-6 py-3 text-sm text-white">
                        {t.senderCity?.name || t.senderCountry?.name || 'Склад'}
                      </td>
                      <td className="px-6 py-3 text-sm text-white">
                        {t.receiverCity?.name || t.receiverCountry?.name || '—'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1.5">
                          {t.items?.map((item, idx) => (
                            <ItemBadge key={idx} type={item.itemType} quantity={item.quantity} size="sm" />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={STATUS_COLORS[t.status]}>{t.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-dark-200">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-dark-600">
                <p className="text-sm text-dark-200">
                  Стр. {page} из {totalPages} (всего {total})
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm rounded-xl border border-dark-500 text-dark-100 hover:bg-dark-600 disabled:opacity-50 transition-colors"
                  >
                    Назад
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-sm rounded-xl border border-dark-500 text-dark-100 hover:bg-dark-600 disabled:opacity-50 transition-colors"
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
