'use client';

import { useEffect, useState, useCallback } from 'react';
import { usersApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { formatDate } from '@/lib/utils';
import type { User } from '@/lib/types';
import { Search, User as UserIcon } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  COUNTRY: 'bg-green-500/20 text-green-400 border border-green-500/30',
  CITY: 'bg-dark-500/50 text-dark-200 border border-dark-400',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (search) params.search = search;

      const res = await usersApi.getAll(params);
      setUsers(res.data.data?.data || res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Пользователи</h1>
        <p className="text-dark-200 mt-1">Управление аккаунтами и ролями</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select
            options={[
              { value: 'ADMIN', label: 'Админ' },
              { value: 'COUNTRY', label: 'Страна' },
              { value: 'CITY', label: 'Город' },
            ]}
            placeholder="Все роли"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          />
        </div>
        <div className="flex-1 max-w-xs relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-dark-300" />
          <input
            type="text"
            placeholder="Поиск пользователей..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-500 rounded-xl text-sm text-white placeholder-dark-300 focus:outline-none focus:ring-2 focus:ring-accent-purple focus:border-transparent transition-all"
          />
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-dark-300 text-sm p-6 text-center">Пользователи не найдены</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600 bg-dark-700/50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Пользователь</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Роль</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Локация</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Статус</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Создан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-dark-700/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-dark-200" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{u.displayName}</p>
                          <p className="text-xs text-dark-300">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={ROLE_COLORS[u.role]}>{u.role}</Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-dark-100">
                      {u.country?.name || '—'}
                      {u.city && ` / ${u.city.name}`}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={u.isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}>
                        {u.isActive ? 'Активен' : 'Неактивен'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-dark-200">
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
