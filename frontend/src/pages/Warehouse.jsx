import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BraceletRow } from '../components/ui/BraceletBadge';
import {
  Package, Plus, History, RefreshCw,
  Warehouse as WarehouseIcon, AlertCircle,
} from 'lucide-react';

const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];
const BRACELET_LABELS = { black: 'Чёрные', white: 'Белые', red: 'Красные', blue: 'Синие' };

export default function Warehouse() {
  const { user } = useAuthStore();
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');

  // Can access if ADMIN or OFFICE
  const canAccess = user?.role === 'ADMIN' || user?.role === 'OFFICE';

  useEffect(() => {
    if (canAccess) {
      loadData();
    }
  }, [canAccess]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load offices for ADMIN to select
      if (user.role === 'ADMIN') {
        const { data } = await usersApi.getOffices();
        const list = data?.data || data;
        setOffices(Array.isArray(list) ? list : []);
      } else if (user.role === 'OFFICE' && user.officeId) {
        // OFFICE user - automatically set their office
        setSelectedOfficeId(user.officeId);
      }

      await loadBalance();
      await loadHistory();
    } catch (err) {
      console.error('Failed to load warehouse data', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = async () => {
    try {
      const officeId = user.role === 'ADMIN' ? selectedOfficeId : user.officeId;
      if (officeId) {
        const { data } = await inventoryApi.getWarehouseBalance(officeId);
        setBalance(data);
      } else if (user.role === 'ADMIN' && !selectedOfficeId) {
        // For ADMIN without selected office, get total balance (all offices)
        const { data } = await inventoryApi.getWarehouseBalance();
        setBalance(data);
      }
    } catch (err) {
      console.error('Failed to load balance', err);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const officeId = user.role === 'ADMIN' ? selectedOfficeId : user.officeId;
      const params = { take: 50 };
      if (officeId) params.officeId = officeId;
      const { data } = await inventoryApi.getWarehouseCreationHistory(params);
      const list = data?.data || data;
      setHistory(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOfficeChange = async (e) => {
    const id = e.target.value;
    setSelectedOfficeId(id);
    // Reload data for selected office
    setTimeout(() => {
      loadBalance();
      loadHistory();
    }, 0);
  };

  const openCreate = () => {
    setShowCreate(true);
    setError('');
    setQuantities({ black: '', white: '', red: '', blue: '' });
    setNotes('');
    // For OFFICE user, office is pre-selected
    if (user.role === 'OFFICE' && user.officeId) {
      setSelectedOfficeId(user.officeId);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const officeId = user.role === 'ADMIN' ? selectedOfficeId : user.officeId;
    if (!officeId) {
      setError('Выберите офис');
      return;
    }

    const black = parseInt(quantities.black) || 0;
    const white = parseInt(quantities.white) || 0;
    const red = parseInt(quantities.red) || 0;
    const blue = parseInt(quantities.blue) || 0;

    if (black + white + red + blue === 0) {
      setError('Укажите количество браслетов');
      return;
    }

    setSending(true);
    try {
      await inventoryApi.createBracelets({
        officeId,
        black,
        white,
        red,
        blue,
        notes: notes.trim() || undefined,
      });
      setShowCreate(false);
      setQuantities({ black: '', white: '', red: '', blue: '' });
      setNotes('');
      await loadBalance();
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания браслетов');
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await loadBalance();
    await loadHistory();
    setLoading(false);
  };

  // Stats
  const stats = useMemo(() => {
    if (!balance) return { total: 0, black: 0, white: 0, red: 0, blue: 0 };
    const black = balance.black || 0;
    const white = balance.white || 0;
    const red = balance.red || 0;
    const blue = balance.blue || 0;
    return { total: black + white + red + blue, black, white, red, blue };
  }, [balance]);

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-content-muted">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <p>Доступ только для ADMIN и OFFICE</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <WarehouseIcon size={22} className="text-brand-500" /> Склад
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Создание новых браслетов и учёт остатков на складе
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw size={16} />
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> Создать
          </Button>
        </div>
      </div>

      {/* ── Office selector (ADMIN only) ──────────────── */}
      {user.role === 'ADMIN' && offices.length > 0 && (
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <Select
            label="Офис"
            value={selectedOfficeId}
            onChange={handleOfficeChange}
          >
            <option value="">Все офисы</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
            ))}
          </Select>
        </div>
      )}

      {/* ── Balance Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
              <Package size={18} className="text-brand-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{stats.total.toLocaleString()}</div>
              <div className="text-xs text-content-muted">Всего</div>
            </div>
          </div>
        </div>
        {BRACELET_KEYS.map((key) => {
          const colors = {
            black: { bg: 'bg-gray-100 dark:bg-gray-800', icon: 'text-gray-700 dark:text-gray-300' },
            white: { bg: 'bg-gray-50 dark:bg-gray-700', icon: 'text-gray-400' },
            red: { bg: 'bg-red-50 dark:bg-red-900/30', icon: 'text-red-500' },
            blue: { bg: 'bg-blue-50 dark:bg-blue-900/30', icon: 'text-blue-500' },
          };
          return (
            <div key={key} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${colors[key].bg} flex items-center justify-center`}>
                  <div className={`w-4 h-4 rounded-full ${key === 'black' ? 'bg-gray-900 dark:bg-gray-300' : key === 'white' ? 'bg-gray-300 dark:bg-gray-500 border border-gray-400' : key === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-content-primary">{stats[key].toLocaleString()}</div>
                  <div className="text-xs text-content-muted">{BRACELET_LABELS[key]}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Creation History ──────────────────────────── */}
      <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge">
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <h3 className="font-semibold text-content-primary flex items-center gap-2">
            <History size={18} /> История создания
          </h3>
          {historyLoading && (
            <div className="animate-spin h-4 w-4 border-2 border-brand-200 border-t-brand-600 rounded-full" />
          )}
        </div>
        <div className="divide-y divide-edge">
          {history.length === 0 ? (
            <div className="p-8 text-center text-content-muted">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p>История пуста</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-4 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-content-primary">
                      {item.office?.name || 'Офис'}
                    </div>
                    <div className="text-xs text-content-muted mt-1">
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                      {item.createdByUser && (
                        <span className="ml-2">• {item.createdByUser.displayName || item.createdByUser.username}</span>
                      )}
                    </div>
                    {item.notes && (
                      <div className="text-xs text-content-secondary mt-1 italic">
                        {item.notes}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      +{item.totalAmount?.toLocaleString()}
                    </div>
                    <BraceletRow black={item.black} white={item.white} red={item.red} blue={item.blue} size="sm" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Create Modal ──────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Создать браслеты">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[var(--radius-md)] text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Office selector for ADMIN */}
          {user.role === 'ADMIN' && (
            <Select
              label="Офис *"
              value={selectedOfficeId}
              onChange={(e) => setSelectedOfficeId(e.target.value)}
              required
            >
              <option value="">Выберите офис</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
              ))}
            </Select>
          )}

          {/* OFFICE user sees their office name */}
          {user.role === 'OFFICE' && (
            <div className="text-sm text-content-secondary">
              Офис: <span className="font-medium">{user.office?.name || 'Ваш офис'}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {BRACELET_KEYS.map((key) => (
              <Input
                key={key}
                type="number"
                label={BRACELET_LABELS[key]}
                value={quantities[key]}
                onChange={(e) => setQuantities({ ...quantities, [key]: e.target.value })}
                min="0"
                placeholder="0"
              />
            ))}
          </div>

          <Input
            label="Примечание"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Опционально: партия, поставщик и т.д."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
