'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { transfersApi, usersApi } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import ItemBadge from '@/components/ui/ItemBadge';
import { STATUS_COLORS, STATUS_LABELS, formatDate } from '@/lib/utils';
import type { Transfer, Country, City, ItemType } from '@/lib/types';
import { Plus, Send, PackageCheck, XCircle, Ban, AlertTriangle } from 'lucide-react';

const ITEM_TYPES: ItemType[] = ['BLACK', 'WHITE', 'RED', 'BLUE'];

export default function TransfersPage() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Create transfer modal
  const [createModal, setCreateModal] = useState(false);
  const [createData, setCreateData] = useState({
    receiverType: 'CITY' as string,
    receiverCountryId: '',
    receiverCityId: '',
    items: [{ itemType: 'BLACK', quantity: 0 }] as Array<{ itemType: string; quantity: number }>,
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Accept transfer modal (blind acceptance)
  const [acceptModal, setAcceptModal] = useState(false);
  const [acceptTransfer, setAcceptTransfer] = useState<Transfer | null>(null);
  const [acceptItems, setAcceptItems] = useState<Record<string, number>>({});

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTransferId, setRejectTransferId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter !== 'all') params.status = filter;

      const [transferRes, countriesRes, citiesRes] = await Promise.all([
        transfersApi.getAll(params),
        usersApi.getCountries(),
        usersApi.getCities(),
      ]);

      setTransfers(transferRes.data.data?.data || transferRes.data.data || []);
      setCountries(countriesRes.data.data || []);
      setCities(citiesRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine sender entity from current user
  const getSenderInfo = () => {
    if (!user) return { senderType: 'COUNTRY' as string };
    if (user.cityId) return { senderType: 'CITY', senderCityId: user.cityId };
    if (user.countryId) return { senderType: 'COUNTRY', senderCountryId: user.countryId };
    return { senderType: 'ADMIN' };
  };

  const handleCreate = async () => {
    if (!user) return;
    setCreateLoading(true);
    try {
      const sender = getSenderInfo();
      await transfersApi.create({
        senderType: sender.senderType,
        senderCountryId: sender.senderCountryId,
        senderCityId: sender.senderCityId,
        receiverType: createData.receiverType,
        receiverCountryId: createData.receiverType === 'COUNTRY' ? createData.receiverCountryId : undefined,
        receiverCityId: createData.receiverType === 'CITY' ? createData.receiverCityId : undefined,
        items: createData.items.filter((i) => i.quantity > 0),
      });
      setCreateModal(false);
      setCreateData({
        receiverType: 'CITY',
        receiverCountryId: '',
        receiverCityId: '',
        items: [{ itemType: 'BLACK', quantity: 0 }],
      });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAction = async (transferId: string, action: 'send' | 'cancel') => {
    setActionLoading(transferId);
    try {
      if (action === 'send') await transfersApi.send(transferId);
      else if (action === 'cancel') await transfersApi.cancel(transferId);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  // Open blind acceptance modal
  const openAcceptModal = (transfer: Transfer) => {
    setAcceptTransfer(transfer);
    // Initialize quantities to 0 — user must count and enter
    const initItems: Record<string, number> = {};
    for (const item of transfer.items) {
      initItems[item.itemType] = 0;
    }
    setAcceptItems(initItems);
    setAcceptModal(true);
  };

  const handleAccept = async () => {
    if (!acceptTransfer) return;
    setActionLoading(acceptTransfer.id);
    try {
      const items = Object.entries(acceptItems).map(([itemType, receivedQuantity]) => ({
        itemType,
        receivedQuantity,
      }));
      await transfersApi.accept(acceptTransfer.id, items);
      setAcceptModal(false);
      setAcceptTransfer(null);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading(rejectTransferId);
    try {
      await transfersApi.reject(rejectTransferId, rejectReason);
      setRejectModal(false);
      setRejectReason('');
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const addItem = () => {
    setCreateData({
      ...createData,
      items: [...createData.items, { itemType: 'BLACK', quantity: 0 }],
    });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const items = [...createData.items];
    items[index] = { ...items[index], [field]: value };
    setCreateData({ ...createData, items });
  };

  const removeItem = (index: number) => {
    setCreateData({
      ...createData,
      items: createData.items.filter((_, i) => i !== index),
    });
  };

  const destinationId = createData.receiverType === 'CITY' ? createData.receiverCityId : createData.receiverCountryId;
  const destinationOptions =
    createData.receiverType === 'CITY'
      ? cities.map((c) => ({ value: c.id, label: c.name }))
      : countries.map((c) => ({ value: c.id, label: c.name }));

  // Check if current user is the receiver of a transfer
  const isReceiver = (t: Transfer) => {
    if (!user) return false;
    if (user.role === 'COUNTRY' && t.receiverType === 'COUNTRY') {
      return t.receiverCountryId === user.countryId;
    }
    if (user.role === 'CITY' && t.receiverType === 'CITY') {
      return t.receiverCityId === user.cityId;
    }
    return false;
  };

  const senderName = (t: Transfer) =>
    t.senderCity?.name || t.senderCountry?.name || 'Склад';
  const receiverName = (t: Transfer) =>
    t.receiverCity?.name || t.receiverCountry?.name || 'Неизвестно';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Трансферы</h1>
          <p className="text-dark-200 mt-1">Управление трансферами между локациями</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'COUNTRY') && (
          <Button onClick={() => setCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Новый трансфер
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'DRAFT', 'SENT', 'ACCEPTED', 'DISCREPANCY_FOUND', 'REJECTED', 'CANCELLED'].map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                filter === s
                  ? 'bg-accent-purple text-white shadow-lg shadow-accent-purple/25'
                  : 'bg-dark-700 text-dark-200 hover:bg-dark-600 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Все' : (STATUS_LABELS[s] || s.replace(/_/g, ' '))}
            </button>
          ),
        )}
      </div>

      {/* Transfers list */}
      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : transfers.length === 0 ? (
          <p className="text-dark-300 text-sm p-6 text-center">Трансферы не найдены</p>
        ) : (
          <div className="divide-y divide-dark-600">
            {transfers.map((t) => (
              <div key={t.id} className="px-6 py-4 hover:bg-dark-700/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm font-semibold text-white">
                        {senderName(t)}
                        <span className="mx-2 text-dark-300">&rarr;</span>
                        {receiverName(t)}
                      </p>
                      <Badge variant={STATUS_COLORS[t.status]}>
                        {STATUS_LABELS[t.status] || t.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {t.items?.map((item, idx) => (
                        <ItemBadge key={idx} type={item.itemType} quantity={item.quantity} size="sm" />
                      ))}
                    </div>
                    <p className="text-xs text-dark-300 mt-1">{formatDate(t.createdAt)}</p>
                    {t.notes && (
                      <p className="text-xs text-dark-200 mt-1">Заметка: {t.notes}</p>
                    )}
                    {t.rejection && (
                      <p className="text-xs text-red-400 mt-1">
                        Отклонено: {t.rejection.reason}
                      </p>
                    )}
                    {/* Show discrepancy details */}
                    {t.status === 'DISCREPANCY_FOUND' && t.acceptanceRecords && (
                      <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium mb-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Расхождение
                        </div>
                        {t.acceptanceRecords.filter(r => r.discrepancy !== 0).map((r, idx) => (
                          <p key={idx} className="text-xs text-amber-300">
                            {r.itemType}: отправлено {r.sentQuantity}, получено {r.receivedQuantity}
                            {' '}(разница: {r.discrepancy > 0 ? '+' : ''}{r.discrepancy})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {t.status === 'DRAFT' && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          isLoading={actionLoading === t.id}
                          onClick={() => handleAction(t.id, 'send')}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" />
                          Отправить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction(t.id, 'cancel')}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {t.status === 'SENT' && isReceiver(t) && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          isLoading={actionLoading === t.id}
                          onClick={() => openAcceptModal(t)}
                        >
                          <PackageCheck className="w-3.5 h-3.5 mr-1" />
                          Принять
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setRejectTransferId(t.id);
                            setRejectModal(true);
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Отклонить
                        </Button>
                      </>
                    )}
                    {t.status === 'SENT' && !isReceiver(t) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAction(t.id, 'cancel')}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" />
                        Отменить
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create transfer modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title="Новый трансфер"
        size="lg"
      >
        <div className="space-y-5">
          <Select
            id="receiverType"
            label="Тип назначения"
            options={[
              { value: 'CITY', label: 'Город' },
              { value: 'COUNTRY', label: 'Страна' },
            ]}
            value={createData.receiverType}
            onChange={(e) =>
              setCreateData({ ...createData, receiverType: e.target.value, receiverCountryId: '', receiverCityId: '' })
            }
          />

          <Select
            id="destination"
            label="Назначение"
            options={destinationOptions}
            placeholder="Выберите назначение"
            value={destinationId}
            onChange={(e) =>
              setCreateData({
                ...createData,
                receiverCountryId: createData.receiverType === 'COUNTRY' ? e.target.value : '',
                receiverCityId: createData.receiverType === 'CITY' ? e.target.value : '',
              })
            }
          />

          <div>
            <label className="block text-sm font-medium text-dark-100 mb-2">Предметы</label>
            <div className="space-y-2">
              {createData.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <Select
                    options={ITEM_TYPES.map((t) => ({ value: t, label: t }))}
                    value={item.itemType}
                    onChange={(e) => updateItem(idx, 'itemType', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity || ''}
                    onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                    placeholder="Кол-во"
                    className="w-24"
                  />
                  {createData.items.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                      <XCircle className="w-4 h-4 text-red-400" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addItem} className="mt-2">
              <Plus className="w-4 h-4 mr-1" /> Добавить предмет
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>
              Отмена
            </Button>
            <Button
              isLoading={createLoading}
              onClick={handleCreate}
              disabled={!destinationId || createData.items.every((i) => i.quantity <= 0)}
            >
              Создать трансфер
            </Button>
          </div>
        </div>
      </Modal>

      {/* Blind acceptance modal */}
      <Modal
        isOpen={acceptModal}
        onClose={() => { setAcceptModal(false); setAcceptTransfer(null); }}
        title="Приёмка трансфера"
        size="lg"
      >
        {acceptTransfer && (
          <div className="space-y-5">
            <div className="p-3 bg-dark-700 rounded-xl">
              <p className="text-sm text-dark-200">
                Отправитель: <span className="text-white font-medium">{senderName(acceptTransfer)}</span>
              </p>
              <p className="text-xs text-dark-300 mt-1">
                Введите количество каждого типа, которое вы фактически получили.
                Отправленные количества скрыты — просто пересчитайте и введите.
              </p>
            </div>

            <div className="space-y-3">
              {acceptTransfer.items.map((item) => (
                <div key={item.itemType} className="flex items-center gap-3">
                  <ItemBadge type={item.itemType} size="md" />
                  <Input
                    type="number"
                    min={0}
                    value={acceptItems[item.itemType] ?? 0}
                    onChange={(e) =>
                      setAcceptItems({ ...acceptItems, [item.itemType]: parseInt(e.target.value) || 0 })
                    }
                    placeholder="Получено"
                    className="w-32"
                  />
                  <span className="text-xs text-dark-300">шт.</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setAcceptModal(false); setAcceptTransfer(null); }}>
                Отмена
              </Button>
              <Button
                isLoading={!!actionLoading}
                onClick={handleAccept}
              >
                <PackageCheck className="w-4 h-4 mr-1" />
                Подтвердить приёмку
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal
        isOpen={rejectModal}
        onClose={() => setRejectModal(false)}
        title="Отклонить трансфер"
      >
        <div className="space-y-4">
          <Input
            id="rejectReason"
            label="Причина отклонения"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Укажите причину отклонения"
            required
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRejectModal(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              isLoading={!!actionLoading}
              disabled={!rejectReason.trim()}
            >
              Отклонить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
