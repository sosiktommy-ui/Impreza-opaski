'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { inventoryApi, transfersApi, usersApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ItemBadge from '@/components/ui/ItemBadge';
import { STATUS_COLORS, CITY_STATUS_COLORS, formatNumber } from '@/lib/utils';
import {
  Package,
  ArrowLeftRight,
  AlertTriangle,
  Globe,
  Building2,
} from 'lucide-react';
import type { Transfer, InventoryBalance, City } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<Transfer[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [stats, setStats] = useState({
    totalItems: 0,
    pendingCount: 0,
    lowStockCities: 0,
    activeCities: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [invRes, transferRes, citiesRes] = await Promise.all([
        inventoryApi.getAllBalances(),
        transfersApi.getPending(),
        usersApi.getCities(),
      ]);

      const inv: InventoryBalance[] = invRes.data.data || [];
      const transfers: Transfer[] = transferRes.data.data || [];
      const cityList: City[] = citiesRes.data.data || [];

      setBalances(inv);
      setPendingTransfers(transfers);
      setCities(cityList);

      const totalItems = inv.reduce((sum: number, b: InventoryBalance) => sum + b.quantity, 0);
      const lowStockCities = cityList.filter((c: City) => c.status === 'LOW').length;
      const activeCities = cityList.filter((c: City) => c.status === 'ACTIVE').length;

      setStats({
        totalItems,
        pendingCount: transfers.length,
        lowStockCities,
        activeCities,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
      </div>
    );
  }

  // Aggregate balances by item type
  const totals = balances.reduce(
    (acc, b) => {
      acc[b.itemType] = (acc[b.itemType] || 0) + b.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Обзор</h1>
        <p className="text-dark-200 mt-1">
          Добро пожаловать, {user?.displayName}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-purple/15 rounded-xl">
              <Package className="w-6 h-6 text-accent-purple" />
            </div>
            <div>
              <p className="text-sm text-dark-200">Всего предметов</p>
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalItems)}</p>
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/15 rounded-xl">
              <ArrowLeftRight className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-dark-200">Ожидают приёмки</p>
              <p className="text-2xl font-bold text-white">{stats.pendingCount}</p>
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/15 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-dark-200">Мало на складе</p>
              <p className="text-2xl font-bold text-white">{stats.lowStockCities}</p>
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/15 rounded-xl">
              <Building2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-dark-200">Активные города</p>
              <p className="text-2xl font-bold text-white">{stats.activeCities}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Item totals */}
      <Card title="Обзор склада" subtitle="Общее количество по всем локациям">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => (
            <div key={type} className="text-center p-4 rounded-xl bg-dark-700/50">
              <ItemBadge type={type} />
              <p className="text-2xl font-bold mt-2 text-white">{formatNumber(totals[type] || 0)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending transfers */}
        <Card title="Ожидают приёмки" subtitle={`${stats.pendingCount} требуют действия`} noPadding>
          {pendingTransfers.length === 0 ? (
            <p className="text-dark-300 text-sm p-6">Нет ожидающих трансферов</p>
          ) : (
            <div className="divide-y divide-dark-600">
              {pendingTransfers.slice(0, 5).map((t) => (
                <div key={t.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {t.senderCity?.name || t.senderCountry?.name || 'Склад'} &rarr;{' '}
                      {t.receiverCity?.name || t.receiverCountry?.name || 'Неизвестно'}
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      {t.items?.map((item) => (
                        <ItemBadge key={item.id} type={item.itemType} quantity={item.quantity} size="sm" />
                      ))}
                    </div>
                  </div>
                  <Badge variant={STATUS_COLORS[t.status]}>{t.status.replace('_', ' ')}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Low-stock cities */}
        <Card title="Города с низким запасом" subtitle="Города со статусом LOW или INACTIVE" noPadding>
          {cities.filter((c) => c.status !== 'ACTIVE').length === 0 ? (
            <p className="text-dark-300 text-sm p-6">Все города полностью укомплектованы</p>
          ) : (
            <div className="divide-y divide-dark-600">
              {cities
                .filter((c) => c.status !== 'ACTIVE')
                .slice(0, 8)
                .map((city) => (
                  <div key={city.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-dark-300" />
                      <span className="text-sm text-white">{city.name}</span>
                    </div>
                    <Badge variant={CITY_STATUS_COLORS[city.status]}>{city.status}</Badge>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
