import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import { authApi } from '../api/auth';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal, { TwoFactorModal } from '../components/ui/Modal';
import BraceletBadge, { BraceletRow } from '../components/ui/BraceletBadge';
import { Boxes, Plus, Minus, Package, History, RefreshCw, ChevronRight, ArrowLeft } from 'lucide-react';

const COLORS = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const COLOR_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const COLOR_STYLES = {
  BLACK: 'bg-gray-900 text-white',
  WHITE: 'bg-white border-2 border-gray-200 text-gray-800',
  RED: 'bg-red-600 text-white',
  BLUE: 'bg-blue-600 text-white',
};
const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];
const BRACELET_LABELS = { black: 'Чёрные', white: 'Белые', red: 'Красные', blue: 'Синие' };

export default function Inventory() {
  const { user } = useAuthStore();
  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';
  
  // Tab state: 'my' = Мой баланс (склад), 'system' = Баланс системы
  const [activeTab, setActiveTab] = useState(isAdminOrOffice ? 'my' : 'system');
  
  // System balance state (existing inventory)
  const [balances, setBalances] = useState([]);
  const [allInventory, setAllInventory] = useState([]);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [viewEntity, setViewEntity] = useState({ type: '', id: '' });
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ itemType: 'BLACK', delta: 0, reason: '' });
  const [adjusting, setAdjusting] = useState(false);
  
  // Warehouse (Мой баланс) state
  const [warehouseBalance, setWarehouseBalance] = useState(null);
  const [warehouseHistory, setWarehouseHistory] = useState([]);
  const [offices, setOffices] = useState([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ black: '', white: '', red: '', blue: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  
  // 2FA state for bracelet creation
  const [show2FA, setShow2FA] = useState(false);
  const [pendingCreateData, setPendingCreateData] = useState(null);
  
  // Accordion state for countries
  const [expandedCountries, setExpandedCountries] = useState({});

  useEffect(() => {
    init();
  }, []);

  // Load warehouse data when tab changes to 'my'
  useEffect(() => {
    if (activeTab === 'my' && isAdminOrOffice) {
      loadWarehouseData();
    }
  }, [activeTab, selectedOfficeId]);

  const init = async () => {
    if (isAdminOrOffice) {
      try {
        const [countriesRes, inventoryRes, officesRes] = await Promise.all([
          usersApi.getCountries(),
          inventoryApi.getAll(),
          usersApi.getOffices().catch((err) => {
            console.error('Failed to load offices:', err);
            return { data: [] };
          }),
        ]);
        const cPayload = countriesRes.data?.data || countriesRes.data;
        setCountries(Array.isArray(cPayload) ? cPayload : []);

        // Filter out ADMIN and OFFICE inventory from system totals
        const iPayload = inventoryRes.data?.data || inventoryRes.data;
        const filtered = (Array.isArray(iPayload) ? iPayload : []).filter(
          inv => inv.entityType !== 'ADMIN' && inv.entityType !== 'OFFICE'
        );
        setAllInventory(filtered);

        // Parse offices response
        const oPayload = officesRes.data?.data || officesRes.data || officesRes;
        console.log('Offices response:', officesRes, 'Payload:', oPayload);
        setOffices(Array.isArray(oPayload) ? oPayload : []);

        // Auto-select office for OFFICE users
        if (user.role === 'OFFICE' && user.officeId) {
          setSelectedOfficeId(user.officeId);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    } else if (user.role === 'COUNTRY') {
      // COUNTRY: load country balance + all city balances directly
      try {
        setViewEntity({ type: 'COUNTRY', id: user.countryId });
        const [balanceRes, citiesRes] = await Promise.all([
          inventoryApi.getByCountry(user.countryId),
          usersApi.getCities(user.countryId),
        ]);
        const bPayload = balanceRes.data?.data || balanceRes.data;
        // getBalancesByCountry returns { country: {...}, cities: [...] }
        if (bPayload?.country) {
          const countryBal = bPayload.country;
          const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
          setBalances(
            Object.entries(countryBal)
              .filter(([key]) => VALID_TYPES.includes(key))
              .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
          );
        }
        const citiesPayload = citiesRes.data?.data || citiesRes.data;
        setCities(Array.isArray(citiesPayload) ? citiesPayload : []);
        // Build city balances from the country endpoint response
        if (bPayload?.cities && Array.isArray(bPayload.cities)) {
          const cityInv = [];
          bPayload.cities.forEach((c) => {
            if (c.balance && c.city) {
              Object.entries(c.balance).forEach(([itemType, quantity]) => {
                if (['BLACK', 'WHITE', 'RED', 'BLUE'].includes(itemType)) {
                  cityInv.push({
                    entityType: 'CITY',
                    city: c.city,
                    itemType,
                    quantity: Number(quantity) || 0,
                  });
                }
              });
            }
          });
          setAllInventory(cityInv);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    } else {
      setViewEntity({ type: 'CITY', id: user.cityId });
      await loadBalance('CITY', user.cityId);
    }
  };

  // System-wide totals for Admin/Office
  const systemTotals = useMemo(() => {
    const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
    allInventory.forEach((inv) => {
      if (totals[inv.itemType] !== undefined) {
        totals[inv.itemType] += inv.quantity || 0;
      }
    });
    return totals;
  }, [allInventory]);

  const systemTotal = useMemo(() =>
    Object.values(systemTotals).reduce((s, v) => s + v, 0),
  [systemTotals]);

  // Group inventory by country for Admin/Office overview
  const countryBreakdown = useMemo(() => {
    if (!isAdminOrOffice || allInventory.length === 0) return [];

    const countryMap = {};

    allInventory.forEach((inv) => {
      let countryId = null;
      let countryName = null;

      if (inv.entityType === 'COUNTRY' && inv.country) {
        countryId = inv.country.id;
        countryName = inv.country.name;
      } else if (inv.entityType === 'CITY' && inv.city) {
        countryId = inv.city.countryId;
        // We'll resolve the name from countries list
      } else if (inv.entityType === 'OFFICE') {
        // Office inventory shown separately
        return;
      }

      if (!countryId) return;

      if (!countryMap[countryId]) {
        const c = countries.find((ct) => ct.id === countryId);
        countryMap[countryId] = {
          id: countryId,
          name: countryName || c?.name || 'Неизвестно',
          totals: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
          cities: {},
        };
      }

      // Add to country totals
      if (inv.entityType === 'COUNTRY') {
        countryMap[countryId].totals[inv.itemType] = (countryMap[countryId].totals[inv.itemType] || 0) + (inv.quantity || 0);
      }

      // If city inventory, track per city
      if (inv.entityType === 'CITY' && inv.city) {
        const cityId = inv.city.id;
        if (!countryMap[countryId].cities[cityId]) {
          countryMap[countryId].cities[cityId] = {
            id: cityId,
            name: inv.city.name,
            totals: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
          };
        }
        countryMap[countryId].cities[cityId].totals[inv.itemType] = (inv.quantity || 0);
      }
    });

    return Object.values(countryMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [allInventory, countries, isAdminOrOffice]);

  const loadBalance = async (entityType, entityId) => {
    try {
      const { data } = await inventoryApi.getBalance(entityType, entityId);
      const payload = data?.data || data;
      const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        setBalances(
          Object.entries(payload)
            .filter(([key]) => VALID_TYPES.includes(key))
            .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
        );
      } else {
        setBalances(Array.isArray(payload) ? payload : []);
      }
    } catch (err) {
      console.error(err);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCountrySelect = async (e) => {
    const cId = e.target.value;
    setSelectedCountry(cId);
    setSelectedCity('');
    if (cId) {
      setViewEntity({ type: 'COUNTRY', id: cId });
      await loadBalance('COUNTRY', cId);
      const { data } = await usersApi.getCities(cId);
      const payload = data?.data || data;
      setCities(Array.isArray(payload) ? payload : []);
    } else {
      setBalances([]);
      setCities([]);
      setViewEntity({ type: '', id: '' });
    }
  };

  const handleCitySelect = async (e) => {
    const cId = e.target.value;
    setSelectedCity(cId);
    if (cId) {
      setViewEntity({ type: 'CITY', id: cId });
      await loadBalance('CITY', cId);
    } else if (selectedCountry) {
      setViewEntity({ type: 'COUNTRY', id: selectedCountry });
      await loadBalance('COUNTRY', selectedCountry);
    }
  };

  const handleCitySelectForCountry = async (e) => {
    const cId = e.target.value;
    setSelectedCity(cId);
    if (cId) {
      await loadBalance('CITY', cId);
    } else {
      await loadBalance('COUNTRY', user.countryId);
    }
  };

  const handleAdjust = async () => {
    if (!viewEntity.type || !viewEntity.id) return;
    setAdjusting(true);
    try {
      await inventoryApi.adjust({
        entityType: viewEntity.type,
        entityId: viewEntity.id,
        itemType: adjustForm.itemType,
        delta: parseInt(adjustForm.delta, 10),
        reason: adjustForm.reason || undefined,
      });
      setShowAdjust(false);
      setAdjustForm({ itemType: 'BLACK', delta: 0, reason: '' });
      await loadBalance(viewEntity.type, viewEntity.id);
      // Refresh system totals
      if (isAdminOrOffice) {
        const { data } = await inventoryApi.getAll();
        const iPayload = data?.data || data;
        setAllInventory(Array.isArray(iPayload) ? iPayload : []);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка корректировки');
    } finally {
      setAdjusting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // WAREHOUSE (Мой баланс) FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────
  const loadWarehouseData = async () => {
    setWarehouseLoading(true);
    try {
      const officeId = user.role === 'ADMIN' ? selectedOfficeId : user.officeId;
      const [balanceRes, historyRes] = await Promise.all([
        inventoryApi.getWarehouseBalance(officeId || undefined),
        inventoryApi.getWarehouseCreationHistory({ officeId: officeId || undefined, take: 50 }),
      ]);
      setWarehouseBalance(balanceRes.data);
      const histList = historyRes.data?.data || historyRes.data;
      setWarehouseHistory(Array.isArray(histList) ? histList : []);
    } catch (err) {
      console.error('Failed to load warehouse data', err);
    } finally {
      setWarehouseLoading(false);
    }
  };

  const handleCreateBracelets = async (e) => {
    e.preventDefault();
    setCreateError('');
    const officeId = user.role === 'ADMIN' ? selectedOfficeId : user.officeId;
    // ADMIN doesn't need officeId, OFFICE does
    if (user.role === 'OFFICE' && !officeId) {
      setCreateError('Выберите офис');
      return;
    }
    const black = parseInt(createForm.black) || 0;
    const white = parseInt(createForm.white) || 0;
    const red = parseInt(createForm.red) || 0;
    const blue = parseInt(createForm.blue) || 0;
    if (black + white + red + blue === 0) {
      setCreateError('Укажите количество браслетов');
      return;
    }
    // Store data and show 2FA confirmation
    setPendingCreateData({ officeId: officeId || undefined, black, white, red, blue, notes: createForm.notes.trim() || undefined });
    setShowCreate(false);
    setShow2FA(true);
  };

  // Confirm creation after 2FA
  const handleCreate2FAConfirm = async (password) => {
    if (!pendingCreateData) return;
    
    // Verify password first - if request succeeds, password is valid
    // Backend throws 401 if password is wrong
    try {
      await authApi.verifyPassword(password);
    } catch (verifyErr) {
      // Password verification failed
      throw new Error(verifyErr.response?.data?.message || 'Неверный пароль');
    }
    
    setCreating(true);
    try {
      await inventoryApi.createBracelets(pendingCreateData);
      setShow2FA(false);
      setPendingCreateData(null);
      setCreateForm({ black: '', white: '', red: '', blue: '', notes: '' });
      await loadWarehouseData();
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Ошибка создания браслетов');
    } finally {
      setCreating(false);
    }
  };

  // Warehouse stats
  const warehouseStats = useMemo(() => {
    if (!warehouseBalance) return { total: 0, black: 0, white: 0, red: 0, blue: 0 };
    const black = warehouseBalance.black || 0;
    const white = warehouseBalance.white || 0;
    const red = warehouseBalance.red || 0;
    const blue = warehouseBalance.blue || 0;
    return { total: black + white + red + blue, black, white, red, blue };
  }, [warehouseBalance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const balanceMap = {};
  balances.forEach((b) => { balanceMap[b.itemType] = b.quantity; });
  const totalBracelets = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Header with Tabs for Admin/Office ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
          <Boxes size={22} className="text-brand-500" /> Баланс
        </h2>
        
        {isAdminOrOffice && (
          <div className="flex items-center gap-2 bg-surface-secondary rounded-lg p-1">
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'my'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-card-hover'
              }`}
            >
              <Package size={16} className="inline mr-2" />
              Мой баланс
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'system'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-card-hover'
              }`}
            >
              <Boxes size={16} className="inline mr-2" />
              Баланс системы
            </button>
          </div>
        )}
      </div>
      
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB: Мой баланс (Warehouse) - ADMIN/OFFICE only */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {isAdminOrOffice && activeTab === 'my' && (
        <div className="space-y-4">
          {/* Office selector (ADMIN only) */}
          {user.role === 'ADMIN' && offices.length > 0 && (
            <Card>
              <Select
                label="Офис"
                value={selectedOfficeId}
                onChange={(e) => setSelectedOfficeId(e.target.value)}
              >
                <option value="">Все офисы</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                ))}
              </Select>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button onClick={() => loadWarehouseData()} variant="outline" size="sm" disabled={warehouseLoading}>
              <RefreshCw size={16} className={warehouseLoading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus size={18} /> Создать браслеты
            </Button>
          </div>

          {/* Balance Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                  <Package size={18} className="text-brand-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-content-primary">{warehouseStats.total.toLocaleString()}</div>
                  <div className="text-xs text-content-muted">Всего</div>
                </div>
              </div>
            </div>
            {BRACELET_KEYS.map((key) => {
              const colors = {
                black: { bg: 'bg-gray-100 dark:bg-gray-800', dot: 'bg-gray-900 dark:bg-gray-300' },
                white: { bg: 'bg-gray-50 dark:bg-gray-700', dot: 'bg-gray-300 dark:bg-gray-500 border border-gray-400' },
                red: { bg: 'bg-red-50 dark:bg-red-900/30', dot: 'bg-red-500' },
                blue: { bg: 'bg-blue-50 dark:bg-blue-900/30', dot: 'bg-blue-500' },
              };
              return (
                <div key={key} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${colors[key].bg} flex items-center justify-center`}>
                      <div className={`w-4 h-4 rounded-full ${colors[key].dot}`} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-content-primary">{warehouseStats[key].toLocaleString()}</div>
                      <div className="text-xs text-content-muted">{BRACELET_LABELS[key]}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Creation History */}
          <Card title={<span className="flex items-center gap-2"><History size={18} /> История создания</span>}>
            {warehouseLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-brand-200 border-t-brand-600 rounded-full" />
              </div>
            ) : warehouseHistory.length === 0 ? (
              <div className="text-center py-8 text-content-muted">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p>История пуста</p>
              </div>
            ) : (
              <div className="divide-y divide-edge -mx-4">
                {warehouseHistory.map((item) => (
                  <div key={item.id} className="px-4 py-3 hover:bg-surface-hover transition-colors">
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
                          <div className="text-xs text-content-secondary mt-1 italic">{item.notes}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">+{item.totalAmount?.toLocaleString()}</div>
                        <BraceletRow black={item.black} white={item.white} red={item.red} blue={item.blue} size="sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Create Modal */}
          <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Создать браслеты">
            <form onSubmit={handleCreateBracelets} className="space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[var(--radius-md)] text-red-600 dark:text-red-400 text-sm">
                  {createError}
                </div>
              )}
              {user.role === 'ADMIN' && (
                <Select
                  label="Офис (опционально)"
                  value={selectedOfficeId}
                  onChange={(e) => setSelectedOfficeId(e.target.value)}
                >
                  <option value="">Главный склад (без офиса)</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                  ))}
                </Select>
              )}
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
                    value={createForm[key]}
                    onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                    min="0"
                    placeholder="0"
                  />
                ))}
              </div>
              <Input
                label="Примечание"
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                placeholder="Опционально: партия, поставщик и т.д."
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание...' : 'Создать'}
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB: Баланс системы (System Inventory) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {(activeTab === 'system' || !isAdminOrOffice) && (
        <div className="space-y-4">
          {/* Action button for adjustments */}
          {isAdminOrOffice && viewEntity.type && viewEntity.id && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAdjust(true)} size="sm" variant="outline">
                <Plus size={16} /> Корректировка
              </Button>
            </div>
          )}

      {/* ── System Totals (Admin/Office) ──────────────── */}
      {isAdminOrOffice && allInventory.length > 0 && (
        <Card title={`Общий баланс системы — ${systemTotal} шт`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {COLORS.map((type) => (
              <div key={type} className={`rounded-[var(--radius-md)] p-4 text-center ${COLOR_STYLES[type]}`}>
                <div className="text-3xl font-bold">{systemTotals[type]}</div>
                <div className="text-sm mt-1 opacity-80">{COLOR_LABELS[type]}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Country Breakdown with Accordion (Admin/Office) ────── */}
      {isAdminOrOffice && countryBreakdown.length > 0 && !selectedCountry && (
        <Card title="Остатки по странам">
          <div className="space-y-1">
            {countryBreakdown.map((country) => {
              const citiesList = Object.values(country.cities);
              const citiesTotal = {};
              COLORS.forEach((c) => {
                citiesTotal[c] = citiesList.reduce((s, city) => s + (city.totals[c] || 0), 0);
              });
              const allTotal = COLORS.reduce((s, c) => s + (country.totals[c] || 0) + (citiesTotal[c] || 0), 0);
              const isExpanded = expandedCountries[country.id];
              
              return (
                <div key={country.id}>
                  {/* Country row */}
                  <div
                    onClick={() => setExpandedCountries(prev => ({ ...prev, [country.id]: !prev[country.id] }))}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-card border border-edge cursor-pointer hover:bg-surface-card-hover transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight size={16} className={`text-content-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <span className="font-medium text-content-primary">{country.name}</span>
                      {citiesList.length > 0 && (
                        <span className="text-xs text-content-muted">({citiesList.length} гор.)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {COLORS.map((c) => {
                        const colorLabels = { BLACK: 'Ч', WHITE: 'Б', RED: 'К', BLUE: 'С' };
                        const val = (country.totals[c] || 0) + (citiesTotal[c] || 0);
                        return (
                          <span key={c} className="text-content-secondary">
                            {colorLabels[c]}:{val}
                          </span>
                        );
                      })}
                      <span className="font-bold text-content-primary ml-2">= {allTotal}</span>
                    </div>
                  </div>
                  
                  {/* Cities accordion */}
                  {isExpanded && citiesList.length > 0 && (
                    <div className="ml-6 mt-1 mb-2 space-y-1">
                      {citiesList.sort((a, b) => a.name.localeCompare(b.name)).map((city) => {
                        const cityTotal = Object.values(city.totals).reduce((s, v) => s + v, 0);
                        return (
                          <div
                            key={city.id}
                            className="flex items-center justify-between p-2.5 rounded-md bg-surface-secondary border border-edge/50"
                          >
                            <span className="text-sm text-content-primary">{city.name}</span>
                            <div className="flex items-center gap-2.5 text-sm">
                              {COLORS.map((c) => {
                                const colorLabels = { BLACK: 'Ч', WHITE: 'Б', RED: 'К', BLUE: 'С' };
                                return (
                                  <span key={c} className="text-content-muted">
                                    {colorLabels[c]}:{city.totals[c] || 0}
                                  </span>
                                );
                              })}
                              <span className="font-medium text-content-primary ml-1">= {cityTotal}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isExpanded && citiesList.length === 0 && (
                    <div className="ml-6 mt-1 mb-2 p-3 text-sm text-content-muted italic">
                      Нет городов в этой стране
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Back button when country/city selected ────── */}
      {isAdminOrOffice && (selectedCountry || selectedCity) && (
        <Button
          onClick={() => { setSelectedCountry(''); setSelectedCity(''); setViewEntity({ type: '', id: '' }); setBalances([]); setCities([]); }}
          variant="outline"
          size="sm"
          className="mb-2"
        >
          <ArrowLeft size={16} /> Вернуться к списку
        </Button>
      )}

      {/* ── Admin/Office filters ──────────────────────── */}
      {isAdminOrOffice && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Страна"
              value={selectedCountry}
              onChange={handleCountrySelect}
              options={[
                { value: '', label: '— Все страны —' },
                ...countries.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            {cities.length > 0 && (
              <Select
                label="Город"
                value={selectedCity}
                onChange={handleCitySelect}
                options={[
                  { value: '', label: '— Все города —' },
                  ...cities.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          </div>
        </Card>
      )}

      {/* Country: city breakdown table */}
      {user.role === 'COUNTRY' && allInventory.length > 0 && (
        <Card title="Города">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-xs text-content-muted">
                  <th className="text-left py-2 px-2">Город</th>
                  {COLORS.map((c) => (
                    <th key={c} className="text-center py-2 px-2">{COLOR_LABELS[c]}</th>
                  ))}
                  <th className="text-center py-2 px-2">Итого</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group by city
                  const cityMap = {};
                  allInventory.forEach((inv) => {
                    if (inv.city) {
                      const cId = inv.city.id;
                      if (!cityMap[cId]) {
                        cityMap[cId] = { name: inv.city.name, totals: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 } };
                      }
                      if (COLORS.includes(inv.itemType)) {
                        cityMap[cId].totals[inv.itemType] = inv.quantity || 0;
                      }
                    }
                  });
                  return Object.entries(cityMap)
                    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                    .map(([cityId, data]) => {
                      const cityTotal = Object.values(data.totals).reduce((s, v) => s + v, 0);
                      return (
                        <tr
                          key={cityId}
                          className="border-b border-edge hover:bg-surface-card-hover cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedCity(cityId);
                            loadBalance('CITY', cityId);
                          }}
                        >
                          <td className="py-2.5 px-2 font-medium text-content-primary">{data.name}</td>
                          {COLORS.map((c) => (
                            <td key={c} className="text-center py-2.5 px-2 text-content-secondary">{data.totals[c]}</td>
                          ))}
                          <td className="text-center py-2.5 px-2 font-semibold text-content-primary">{cityTotal}</td>
                        </tr>
                      );
                    });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Balance display for selected entity */}
      {balances.length > 0 && (selectedCountry || !isAdminOrOffice) ? (
        <Card title={`Текущий баланс — ${totalBracelets} шт всего`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {COLORS.map((type) => (
              <div key={type} className={`rounded-[var(--radius-md)] p-4 text-center ${COLOR_STYLES[type]}`}>
                <div className="text-3xl font-bold">{balanceMap[type] || 0}</div>
                <div className="text-sm mt-1 opacity-80">{COLOR_LABELS[type]}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : !isAdminOrOffice ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет данных</p>
        </Card>
      ) : null}

      {/* ── City breakdown when country selected (Admin/Office) ── */}
      {isAdminOrOffice && selectedCountry && !selectedCity && (() => {
        const countryData = countryBreakdown.find((c) => c.id === selectedCountry);
        const citiesList = countryData ? Object.values(countryData.cities) : [];
        if (citiesList.length === 0) return null;
        return (
          <Card title="Города">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-xs text-content-muted">
                    <th className="text-left py-2 px-2">Город</th>
                    {COLORS.map((c) => (
                      <th key={c} className="text-center py-2 px-2">{COLOR_LABELS[c]}</th>
                    ))}
                    <th className="text-center py-2 px-2">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {citiesList.sort((a, b) => a.name.localeCompare(b.name)).map((city) => {
                    const cityTotal = Object.values(city.totals).reduce((s, v) => s + v, 0);
                    return (
                      <tr
                        key={city.id}
                        className="border-b border-edge hover:bg-surface-card-hover cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedCity(city.id);
                          handleCitySelect({ target: { value: city.id } });
                        }}
                      >
                        <td className="py-2.5 px-2 font-medium text-content-primary">{city.name}</td>
                        {COLORS.map((c) => (
                          <td key={c} className="text-center py-2.5 px-2 text-content-secondary">
                            {city.totals[c] || 0}
                          </td>
                        ))}
                        <td className="text-center py-2.5 px-2 font-semibold text-content-primary">{cityTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SHARED: Adjust balance modal */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="Корректировка остатков">
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            {viewEntity.type === 'COUNTRY' ? 'Страна' : 'Город'}:{' '}
            {viewEntity.type === 'COUNTRY'
              ? countries.find((c) => c.id === viewEntity.id)?.name || selectedCountry
              : cities.find((c) => c.id === viewEntity.id)?.name || selectedCity}
          </div>
          <Select
            label="Тип браслета"
            value={adjustForm.itemType}
            onChange={(e) => setAdjustForm((p) => ({ ...p, itemType: e.target.value }))}
            options={[
              { value: 'BLACK', label: 'Чёрный' },
              { value: 'WHITE', label: 'Белый' },
              { value: 'RED', label: 'Красный' },
              { value: 'BLUE', label: 'Синий' },
            ]}
          />
          <Input
            label="Количество (+ добавить, - убрать)"
            type="number"
            value={adjustForm.delta}
            onChange={(e) => setAdjustForm((p) => ({ ...p, delta: e.target.value }))}
          />
          <Input
            label="Причина (необязательно)"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="Инвентаризация, списание и т.д."
          />
          <div className="flex gap-2">
            <Button
              onClick={() => { setAdjustForm((p) => ({ ...p, delta: Math.abs(p.delta || 0) })); handleAdjust(); }}
              loading={adjusting}
              className="flex-1"
            >
              <Plus size={16} /> Добавить
            </Button>
            <Button
              onClick={() => { setAdjustForm((p) => ({ ...p, delta: -Math.abs(p.delta || 0) })); handleAdjust(); }}
              loading={adjusting}
              variant="outline"
              className="flex-1"
            >
              <Minus size={16} /> Списать
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2FA Modal for bracelet creation */}
      <TwoFactorModal
        isOpen={show2FA}
        onClose={() => { setShow2FA(false); setPendingCreateData(null); }}
        onConfirm={handleCreate2FAConfirm}
        title="Подтвердите создание браслетов"
        description={pendingCreateData ? `Создание: Ч:${pendingCreateData.black || 0} Б:${pendingCreateData.white || 0} К:${pendingCreateData.red || 0} С:${pendingCreateData.blue || 0}` : ''}
        confirmButtonText="Создать"
        confirmButtonVariant="primary"
        isLoading={creating}
      />
    </div>
  );
}
