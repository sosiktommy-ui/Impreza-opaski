'use client';

import { useEffect, useState, useCallback } from 'react';
import { auditApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { formatDate } from '@/lib/utils';
import type { AuditLog } from '@/lib/types';

const ACTION_COLORS: Record<string, string> = {
  TRANSFER_CREATED: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  TRANSFER_SENT: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  TRANSFER_ACCEPTED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  DISCREPANCY_DETECTED: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  TRANSFER_REJECTED: 'bg-red-500/20 text-red-400 border border-red-500/30',
  TRANSFER_CANCELLED: 'bg-dark-500/50 text-dark-200 border border-dark-400',
  INVENTORY_ADJUSTED: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  USER_LOGIN: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  USER_LOGOUT: 'bg-dark-500/50 text-dark-300 border border-dark-400',
  USER_CREATED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  USER_UPDATED: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  USER_DELETED: 'bg-red-500/20 text-red-400 border border-red-500/30',
  EXPENSE_CREATED: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: limit.toString(),
      };
      if (actionFilter) params.action = actionFilter;

      const res = await auditApi.getAll(params);
      const data = res.data.data;
      setLogs(data?.data || []);
      setTotal(data?.meta?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Журнал аудита</h1>
        <p className="text-dark-200 mt-1">Неизменяемая запись всех операций системы</p>
      </div>

      <div className="w-56">
        <Select
          options={Object.keys(ACTION_COLORS).map((a) => ({
            value: a,
            label: a.replace(/_/g, ' '),
          }))}
          placeholder="Все действия"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-dark-300 text-sm p-6 text-center">Записи аудита не найдены</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600 bg-dark-700/50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Время</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Пользователь</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Действие</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Объект</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-dark-700/50 transition-colors">
                      <td className="px-6 py-3 text-sm text-dark-200 whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-white">
                        {log.actor?.displayName || log.actor?.username || log.actorId}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={ACTION_COLORS[log.action] || 'bg-dark-500/50 text-dark-200 border border-dark-400'}>
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-dark-100">
                        {log.entityType}/{log.entityId.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-3 text-xs text-dark-300 max-w-xs truncate">
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
