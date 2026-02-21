'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { inventoryApi, usersApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { CITY_STATUS_COLORS, formatNumber } from '@/lib/utils';
import type { Country, City, InventoryBalance } from '@/lib/types';
import { Plus, Minus, Search } from 'lucide-react';
export default function InventoryPage() {
  const { user } = useAuthStore();
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [balancesByEntity, setBalancesByEntity] = useState<
    Record<string, { entityName: string; entityType: string; status?: string; balances: Record<string, number> }>
  >({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustData, setAdjustData] = useState({
    entityType: '',
    entityId: '',
    entityName: '',
    itemType: 'BLACK',
    quantity: 0,
    reason: '',
    isExpense: false,
  });
  const [adjustLoading, setAdjustLoading] = useState(false);

  const loadCountries = useCallback(async () => {
    try {
      const res = await usersApi.getCountries();
      setCountries(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedCountry) params.countryId = selectedCountry;

      const [invRes, citiesRes] = await Promise.all([
        inventoryApi.getAllBalances(params),
        usersApi.getCities(selectedCountry ? { countryId: selectedCountry } : undefined),
      ]);

      const inv: InventoryBalance[] = invRes.data.data || [];
      const cityList: City[] = citiesRes.data.data || [];

      // Group by entity
      const grouped: typeof balancesByEntity = {};
      for (const b of inv) {
        if (!grouped[b.entityId]) {
          const city = cityList.find((c) => c.id === b.entityId);
          grouped[b.entityId] = {
            entityName: city?.name || b.entityId,
            entityType: b.entityType,
            status: city?.status,
            balances: {},
          };
        }
        grouped[b.entityId].balances[b.itemType] = b.quantity;
      }
      setBalancesByEntity(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdjust = (entityType: string, entityId: string, entityName: string, isExpense: boolean) => {
    setAdjustData({
      entityType,
      entityId,
      entityName,
      itemType: 'BLACK',
      quantity: 0,
      reason: '',
      isExpense,
    });
    setAdjustModal(true);
  };

  const handleAdjust = async () => {
    setAdjustLoading(true);
    try {
      if (adjustData.isExpense) {
        await inventoryApi.createExpense({
          entityType: adjustData.entityType,
          entityId: adjustData.entityId,
          itemType: adjustData.itemType,
          quantity: adjustData.quantity,
          reason: adjustData.reason,
        });
      } else {
        await inventoryApi.adjust({
          entityType: adjustData.entityType,
          entityId: adjustData.entityId,
          itemType: adjustData.itemType,
          quantity: adjustData.quantity,
          reason: adjustData.reason,
        });
      }
      setAdjustModal(false);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setAdjustLoading(false);
    }
  };

  const canAdjust = user?.role === 'ADMIN' || user?.role === 'COUNTRY';

  const filtered = Object.entries(balancesByEntity).filter(([, val]) =>
    val.entityName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Склад</h1>
          <p className="text-dark-200 mt-1">Управление остатками по всем локациям</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="w-64">
          <Select
            options={countries.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Все страны"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          />
        </div>
        <div className="flex-1 max-w-xs relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-dark-300" />
          <input
            type="text"
            placeholder="Поиск города..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-500 rounded-xl text-sm text-white placeholder-dark-300 focus:outline-none focus:ring-1 focus:ring-accent-purple/50 focus:border-accent-purple"
          />
        </div>
      </div>

      {/* Inventory table */}
      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-dark-300 text-sm p-6 text-center">Данные склада не найдены</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600 bg-dark-700/50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Локация</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-200 uppercase">Статус</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-dark-200 uppercase">BLACK</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-dark-200 uppercase">WHITE</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-dark-200 uppercase">RED</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-dark-200 uppercase">BLUE</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-dark-200 uppercase">Всего</th>
                  {canAdjust && (
                    <th className="text-right px-6 py-3 text-xs font-medium text-dark-200 uppercase">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {filtered.map(([entityId, val]) => {
                  const total = Object.values(val.balances).reduce((s, q) => s + q, 0);
                  return (
                    <tr key={entityId} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-white">{val.entityName}</td>
                      <td className="px-6 py-3">
                        {val.status && (
                          <Badge variant={CITY_STATUS_COLORS[val.status] || 'bg-gray-500/20 text-gray-400'}>{val.status}</Badge>
                        )}
                      </td>
                      {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => (
                        <td key={type} className="px-4 py-3 text-center text-sm text-dark-100">
                          {formatNumber(val.balances[type] || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center text-sm font-semibold text-white">
                        {formatNumber(total)}
                      </td>
                      {canAdjust && (
                        <td className="px-6 py-3 text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAdjust(val.entityType, entityId, val.entityName, false)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAdjust(val.entityType, entityId, val.entityName, true)}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Adjust modal */}
      <Modal
        isOpen={adjustModal}
        onClose={() => setAdjustModal(false)}
        title={adjustData.isExpense ? `Расход — ${adjustData.entityName}` : `Корректировка — ${adjustData.entityName}`}
      >
        <div className="space-y-4">
          <Select
            id="itemType"
            label="Тип предмета"
            options={[
              { value: 'BLACK', label: 'BLACK' },
              { value: 'WHITE', label: 'WHITE' },
              { value: 'RED', label: 'RED' },
              { value: 'BLUE', label: 'BLUE' },
            ]}
            value={adjustData.itemType}
            onChange={(e) => setAdjustData({ ...adjustData, itemType: e.target.value })}
          />
          <Input
            id="quantity"
            label="Количество"
            type="number"
            min={1}
            value={adjustData.quantity || ''}
            onChange={(e) => setAdjustData({ ...adjustData, quantity: parseInt(e.target.value) || 0 })}
          />
          <Input
            id="reason"
            label="Причина"
            value={adjustData.reason}
            onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
            placeholder="Укажите причину корректировки"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAdjustModal(false)}>
              Отмена
            </Button>
            <Button
              variant={adjustData.isExpense ? 'danger' : 'primary'}
              isLoading={adjustLoading}
              onClick={handleAdjust}
              disabled={!adjustData.quantity || !adjustData.reason}
            >
              {adjustData.isExpense ? 'Списать' : 'Корректировать'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
