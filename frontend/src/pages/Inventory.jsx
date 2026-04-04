import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import { authApi } from '../api/auth';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal, { TwoFactorModal } from '../components/ui/Modal';
import BraceletBadge, { BraceletRow } from '../components/ui/BraceletBadge';
import { Boxes, Plus, Minus, Package, History, RefreshCw, ChevronRight, ArrowLeft, Globe, MapPin, Sparkles, Home, Building2, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react';

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
  const { countryId: globalCountryId, cityId: globalCityId } = useFilterStore();
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
  const [warehouseTransfers, setWarehouseTransfers] = useState([]);
  const [warehouseExpenses, setWarehouseExpenses] = useState([]);
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
  
  // 2FA state for balance adjustment
  const [showAdjust2FA, setShowAdjust2FA] = useState(false);
  const [pendingAdjustData, setPendingAdjustData] = useState(null);
  
  // Accordion state for countries
  const [expandedCountries, setExpandedCountries] = useState({});

  useEffect(() => {
    init();
  }, [globalCountryId, globalCityId]);

  // Load warehouse data when tab changes to 'my'
  useEffect(() => {
    if (activeTab === 'my' && isAdminOrOffice) {
      loadWarehouseData();
    }
  }, [activeTab]);

  const init = async () => {
    if (isAdminOrOffice) {
      try {
        const filterParams = {};
        if (globalCountryId) filterParams.countryId = globalCountryId;
        if (globalCityId) filterParams.cityId = globalCityId;

        const [countriesRes, inventoryRes, officesRes] = await Promise.all([
          usersApi.getCountries(),
          inventoryApi.getAll(filterParams),
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

        // Parse offices - handle multiple formats
        let officesList = [];
        const oRaw = officesRes.data;
        if (Array.isArray(oRaw)) {
          officesList = oRaw;
        } else if (oRaw && Array.isArray(oRaw.data)) {
          officesList = oRaw.data;
        } else if (Array.isArray(officesRes)) {
          officesList = officesRes;
        }
        setOffices(officesList);

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

  const handleAdjust = (deltaSign) => {
    if (!viewEntity.type || !viewEntity.id) return;
    const absDelta = Math.abs(parseInt(adjustForm.delta, 10) || 0);
    if (absDelta === 0) return;
    const finalDelta = deltaSign === 'minus' ? -absDelta : absDelta;
    setPendingAdjustData({
      entityType: viewEntity.type,
      entityId: viewEntity.id,
      itemType: adjustForm.itemType,
      delta: finalDelta,
      reason: adjustForm.reason || '',
    });
    setShowAdjust(false);
    setShowAdjust2FA(true);
  };

  const handleAdjust2FAConfirm = async (password) => {
    if (!pendingAdjustData) throw new Error('Нет данных для корректировки');
    setAdjusting(true);
    try {
      await inventoryApi.adjust({
        ...pendingAdjustData,
        password,
      });
      setShowAdjust2FA(false);
      setPendingAdjustData(null);
      setAdjustForm({ itemType: 'BLACK', delta: 0, reason: '' });
      await loadBalance(pendingAdjustData.entityType, pendingAdjustData.entityId);
      if (isAdminOrOffice) {
        const { data } = await inventoryApi.getAll();
        const iPayload = data?.data || data;
        setAllInventory(Array.isArray(iPayload) ? iPayload : []);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Ошибка корректировки';
      throw new Error(msg);
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
      const officeId = user.role === 'OFFICE' ? user.officeId : undefined;
      
      const [balanceRes, historyRes, transfersRes, expensesRes] = await Promise.all([
        inventoryApi.getWarehouseBalance(officeId),
        inventoryApi.getWarehouseCreationHistory({ officeId, take: 50 }),
        transfersApi.getAll({ limit: 50 }).catch(() => ({ data: { data: [] } })),
        inventoryApi.getExpenses({ limit: 50 }).catch(() => ({ data: { data: [] } })),
      ]);
      
      
      setWarehouseBalance(balanceRes.data);
      const histList = historyRes.data?.data || historyRes.data;
      setWarehouseHistory(Array.isArray(histList) ? histList : []);
      
      const trList = transfersRes.data?.data || transfersRes.data;
      setWarehouseTransfers(Array.isArray(trList) ? trList : []);
      
      const expList = expensesRes.data?.data || expensesRes.data;
      setWarehouseExpenses(Array.isArray(expList) ? expList : []);
    } catch (err) {
      console.error('Failed to load warehouse data', err);
    } finally {
      setWarehouseLoading(false);
    }
  };

  // Success message state
  const [createSuccess, setCreateSuccess] = useState('');

  const handleCreateBracelets = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
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
    if (!pendingCreateData) {
      console.error('v12: pendingCreateData is null!');
      throw new Error('Нет данных для создания');
    }
    
    
    // Verify password first
    try {
      const verifyRes = await authApi.verifyPassword(password);
    } catch (verifyErr) {
      console.error('v12: Password verification failed:', verifyErr);
      console.error('v12: verifyErr.response:', verifyErr.response);
      const msg = verifyErr.response?.data?.message || verifyErr.message || 'Неверный пароль';
      throw new Error(msg);
    }
    
    setCreating(true);
    try {
      const createRes = await inventoryApi.createBracelets(pendingCreateData);
      
      // Calculate total for success message
      const total = (pendingCreateData.black || 0) + (pendingCreateData.white || 0) + 
                    (pendingCreateData.red || 0) + (pendingCreateData.blue || 0);
      
      setShow2FA(false);
      setPendingCreateData(null);
      setCreateForm({ black: '', white: '', red: '', blue: '', notes: '' });
      setCreateSuccess(`Успешно создано ${total} браслетов!`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setCreateSuccess(''), 5000);
      
      await loadWarehouseData();
    } catch (err) {
      console.error('v12: Create bracelets error:', err);
      console.error('v12: err.response:', err.response);
      const msg = err.response?.data?.message || err.message || 'Ошибка создания браслетов';
      throw new Error(msg);
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

  // Combined operations timeline
  const operationsTimeline = useMemo(() => {
    const ops = [];

    // Warehouse creations
    warehouseHistory.forEach((item) => {
      ops.push({
        id: `creation-${item.id}`,
        type: 'creation',
        date: new Date(item.createdAt),
        label: 'Создание браслетов',
        sublabel: item.createdByUser?.displayName || item.createdByUser?.username || item.office?.name || '',
        notes: item.notes,
        amount: item.totalAmount || 0,
        sign: '+',
        items: { BLACK: item.black || 0, WHITE: item.white || 0, RED: item.red || 0, BLUE: item.blue || 0 },
      });
    });

    // Transfers
    warehouseTransfers.forEach((tr) => {
      const items = {};
      let total = 0;
      (tr.items || []).forEach((i) => {
        items[i.itemType] = (items[i.itemType] || 0) + i.quantity;
        total += i.quantity;
      });
      const receiverName = tr.receiverOffice?.name || tr.receiverCountry?.name || tr.receiverCity?.name || '';
      const senderName = tr.senderOffice?.name || tr.senderCountry?.name || tr.senderCity?.name || '';
      ops.push({
        id: `transfer-${tr.id}`,
        type: 'transfer',
        date: new Date(tr.createdAt),
        label: `Отправка → ${receiverName || 'получатель'}`,
        sublabel: tr.notes || (senderName ? `от ${senderName}` : ''),
        status: tr.status,
        amount: total,
        sign: '-',
        items,
      });
    });

    // Expenses
    warehouseExpenses.forEach((exp) => {
      const total = (exp.black || 0) + (exp.white || 0) + (exp.red || 0) + (exp.blue || 0);
      ops.push({
        id: `expense-${exp.id}`,
        type: 'expense',
        date: new Date(exp.eventDate || exp.createdAt),
        label: exp.eventName || 'Расход',
        sublabel: exp.city?.name || '',
        amount: total,
        sign: '-',
        items: { BLACK: exp.black || 0, WHITE: exp.white || 0, RED: exp.red || 0, BLUE: exp.blue || 0 },
      });
    });

    ops.sort((a, b) => b.date - a.date);
    return ops;
  }, [warehouseHistory, warehouseTransfers, warehouseExpenses]);

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
              title="Баланс вашего склада / офиса"
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
              title="Общий баланс всех аккаунтов в системе"
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
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button onClick={() => loadWarehouseData()} variant="outline" size="sm" disabled={warehouseLoading} title="Обновить данные баланса">
              <RefreshCw size={16} className={warehouseLoading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setShowCreate(true)} size="sm" className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white shadow-lg shadow-brand-500/25" title="Добавить новые браслеты на склад">
              <Sparkles size={16} className="mr-1" /> Создать браслеты
            </Button>
          </div>

          {/* Success message */}
          {createSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[var(--radius-md)] text-green-600 dark:text-green-400 text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
              {createSuccess}
            </div>
          )}

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

          {/* Operations History */}
          <Card title={<span className="flex items-center gap-2"><History size={18} /> История операций</span>}>
            {warehouseLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-brand-200 border-t-brand-600 rounded-full" />
              </div>
            ) : operationsTimeline.length === 0 ? (
              <div className="text-center py-8 text-content-muted">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p>История пуста</p>
              </div>
            ) : (
              <div className="divide-y divide-edge -mx-4">
                {operationsTimeline.map((op) => {
                  const iconMap = {
                    creation: <Plus size={16} className="text-green-500" />,
                    transfer: <ArrowUpRight size={16} className="text-orange-500" />,
                    expense: <Calendar size={16} className="text-red-500" />,
                  };
                  const colorMap = {
                    creation: 'text-green-600',
                    transfer: 'text-orange-600',
                    expense: 'text-red-600',
                  };
                  const bgMap = {
                    creation: 'bg-green-50 dark:bg-green-900/30',
                    transfer: 'bg-orange-50 dark:bg-orange-900/30',
                    expense: 'bg-red-50 dark:bg-red-900/30',
                  };
                  const typeLabel = {
                    creation: 'Создание',
                    transfer: 'Трансфер',
                    expense: 'Расход',
                  };
                  return (
                    <div key={op.id} className="px-4 py-3 hover:bg-surface-hover transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg ${bgMap[op.type]} flex items-center justify-center mt-0.5`}>
                            {iconMap[op.type]}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-content-primary">{op.label}</div>
                            <div className="text-xs text-content-muted mt-0.5">
                              {op.date.toLocaleString('ru-RU')}
                              {op.sublabel && <span className="ml-2">• {op.sublabel}</span>}
                            </div>
                            {op.status && op.status !== 'ACCEPTED' && (
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                                op.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                op.status === 'DISPUTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>{op.status}</span>
                            )}
                            {op.notes && <div className="text-xs text-content-secondary mt-1 italic">{op.notes}</div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${colorMap[op.type]}`}>
                            {op.sign}{op.amount?.toLocaleString()}
                          </div>
                          <BraceletRow items={op.items} size="sm" />
                        </div>
                      </div>
                    </div>
                  );
                })}
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
          
          {/* ── BREADCRUMBS NAVIGATION ─────────────────────── */}
          {isAdminOrOffice && (
            <nav className="flex items-center gap-2 text-sm bg-surface-card rounded-xl px-4 py-3 border border-edge">
              <button
                onClick={() => { setSelectedCountry(''); setSelectedCity(''); setViewEntity({ type: '', id: '' }); setBalances([]); setCities([]); }}
                className={`flex items-center gap-1.5 hover:text-brand-500 transition-colors ${!selectedCountry ? 'text-brand-500 font-semibold' : 'text-content-muted'}`}
              >
                <Home size={16} />
                <span>Баланс системы</span>
              </button>
              {selectedCountry && (() => {
                const countryData = countryBreakdown.find((c) => c.id === selectedCountry);
                const countryName = countryData?.name || countries.find(c => c.id === selectedCountry)?.name || 'Страна';
                return (
                  <>
                    <ChevronRight size={16} className="text-content-muted" />
                    <button
                      onClick={() => { setSelectedCity(''); handleCountrySelect({ target: { value: selectedCountry } }); }}
                      className={`flex items-center gap-1.5 hover:text-brand-500 transition-colors ${!selectedCity ? 'text-brand-500 font-semibold' : 'text-content-muted'}`}
                    >
                      <Globe size={16} />
                      <span>{countryName}</span>
                    </button>
                  </>
                );
              })()}
              {selectedCity && (() => {
                const cityData = cities.find((c) => c.id === selectedCity);
                const cityName = cityData?.name || 'Город';
                return (
                  <>
                    <ChevronRight size={16} className="text-content-muted" />
                    <span className="flex items-center gap-1.5 text-brand-500 font-semibold">
                      <MapPin size={16} />
                      <span>{cityName}</span>
                    </span>
                  </>
                );
              })()}
            </nav>
          )}

          {/* ── CURRENT LEVEL HEADER ─────────────────────── */}
          {isAdminOrOffice && (selectedCountry || selectedCity) && (() => {
            const countryData = countryBreakdown.find((c) => c.id === selectedCountry);
            const countryName = countryData?.name || countries.find(c => c.id === selectedCountry)?.name || 'Страна';
            const cityData = cities.find((c) => c.id === selectedCity);
            const cityName = cityData?.name || '';
            
            return (
              <div className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 rounded-2xl p-6 shadow-xl shadow-brand-500/20">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                    {selectedCity ? <MapPin size={28} className="text-white" /> : <Globe size={28} className="text-white" />}
                  </div>
                  <div>
                    <p className="text-brand-100 text-sm font-medium">
                      {selectedCity ? 'Баланс города' : 'Баланс страны'}
                    </p>
                    <h2 className="text-2xl font-bold text-white">
                      {selectedCity ? `${cityName}, ${countryName}` : countryName}
                    </h2>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action button for adjustments */}
          {isAdminOrOffice && viewEntity.type && viewEntity.id && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAdjust(true)} size="sm" variant="outline" title="Ручная корректировка баланса выбранной сущности">
                <Plus size={16} /> Корректировка
              </Button>
            </div>
          )}

      {/* ── System Totals (Admin/Office - no country selected) ──────────────── */}
      {isAdminOrOffice && allInventory.length > 0 && !selectedCountry && (
        <div className="space-y-3">
          {/* Total System Balance Card */}
          <div className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 rounded-2xl p-6 shadow-xl shadow-brand-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-brand-100 text-sm font-medium">Общий баланс системы</p>
                <p className="text-4xl font-bold text-white mt-1">{systemTotal.toLocaleString()}</p>
                <p className="text-brand-200 text-sm mt-1">браслетов в обороте</p>
              </div>
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                <Boxes size={32} className="text-white" />
              </div>
            </div>
          </div>
          
          {/* Color Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const colorConfigs = {
                BLACK: { gradient: 'from-gray-800 to-gray-900', icon: 'bg-gray-700', text: 'text-white', subtext: 'text-gray-300' },
                WHITE: { gradient: 'from-gray-50 to-gray-100 border border-gray-200', icon: 'bg-white border border-gray-300', text: 'text-gray-800', subtext: 'text-gray-500' },
                RED: { gradient: 'from-red-500 to-red-600', icon: 'bg-red-400', text: 'text-white', subtext: 'text-red-100' },
                BLUE: { gradient: 'from-blue-500 to-blue-600', icon: 'bg-blue-400', text: 'text-white', subtext: 'text-blue-100' },
              };
              return COLORS.map((type) => {
                const cfg = colorConfigs[type];
                return (
                  <div key={type} className={`bg-gradient-to-br ${cfg.gradient} rounded-xl p-4 shadow-lg`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${cfg.icon} rounded-lg flex items-center justify-center shadow-inner`}>
                        <div className="w-4 h-4 rounded-full bg-current opacity-60" />
                      </div>
                      <div>
                        <p className={`text-2xl font-bold ${cfg.text}`}>{systemTotals[type].toLocaleString()}</p>
                        <p className={`text-xs ${cfg.subtext}`}>{COLOR_LABELS[type]}</p>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── Country Breakdown with Accordion (Admin/Office - no country selected) ────── */}
      {isAdminOrOffice && countryBreakdown.length > 0 && !selectedCountry && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Globe size={16} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-content-primary">Остатки по странам</h3>
          </div>
          <div className="space-y-2">
            {countryBreakdown.map((country) => {
              const citiesList = Object.values(country.cities);
              const citiesTotal = {};
              COLORS.forEach((c) => {
                citiesTotal[c] = citiesList.reduce((s, city) => s + (city.totals[c] || 0), 0);
              });
              const allTotal = COLORS.reduce((s, c) => s + (country.totals[c] || 0) + (citiesTotal[c] || 0), 0);
              const isExpanded = expandedCountries[country.id];
              
              return (
                <div key={country.id} className="group">
                  {/* Country row */}
                  <div
                    onClick={() => setExpandedCountries(prev => ({ ...prev, [country.id]: !prev[country.id] }))}
                    title={`Нажмите чтобы ${isExpanded ? 'свернуть' : 'развернуть'} города ${country.name}`}
                    className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                      isExpanded 
                        ? 'bg-gradient-to-r from-brand-50 to-brand-100/50 dark:from-brand-900/30 dark:to-brand-800/20 border-2 border-brand-200 dark:border-brand-700 shadow-sm' 
                        : 'bg-surface-card border border-edge hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight size={18} className={`text-brand-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                      <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow">
                        <span className="text-white text-sm font-bold">{country.name.slice(0, 1)}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-content-primary">{country.name}</span>
                        {citiesList.length > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-surface-secondary rounded-full text-xs text-content-muted">{citiesList.length} гор.</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BraceletRow items={{ BLACK: (country.totals.BLACK || 0) + (citiesTotal.BLACK || 0), WHITE: (country.totals.WHITE || 0) + (citiesTotal.WHITE || 0), RED: (country.totals.RED || 0) + (citiesTotal.RED || 0), BLUE: (country.totals.BLUE || 0) + (citiesTotal.BLUE || 0) }} size="sm" />
                      <div className="ml-2 px-3 py-1 bg-brand-500 text-white rounded-lg text-sm font-bold shadow">
                        {allTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Cities accordion */}
                  {isExpanded && citiesList.length > 0 && (
                    <div className="ml-8 mt-2 mb-3 space-y-1.5 border-l-2 border-brand-200 dark:border-brand-700 pl-4">
                      {citiesList.sort((a, b) => a.name.localeCompare(b.name)).map((city) => {
                        const cityTotal = Object.values(city.totals).reduce((s, v) => s + v, 0);
                        return (
                          <div
                            key={city.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary/80 backdrop-blur border border-edge/50 hover:bg-surface-card hover:border-brand-200 dark:hover:border-brand-700 transition-all cursor-pointer"
                            title={`Посмотреть баланс города ${city.name}`}
                            onClick={(e) => { e.stopPropagation(); setSelectedCountry(country.id); setSelectedCity(city.id); handleCitySelect({ target: { value: city.id } }); }}
                          >
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-brand-400" />
                              <span className="text-sm font-medium text-content-primary">{city.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <BraceletRow items={{ BLACK: city.totals.BLACK || 0, WHITE: city.totals.WHITE || 0, RED: city.totals.RED || 0, BLUE: city.totals.BLUE || 0 }} size="sm" />
                              <span className="px-2 py-0.5 bg-content-primary/10 rounded-md text-xs font-semibold text-content-primary">{cityTotal}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isExpanded && citiesList.length === 0 && (
                    <div className="ml-8 mt-2 mb-3 p-4 text-sm text-content-muted italic border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                      Нет городов в этой стране
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── COUNTRY VIEW: Show separate balances when inside a country ────── */}
      {isAdminOrOffice && selectedCountry && !selectedCity && (() => {
        const countryData = countryBreakdown.find((c) => c.id === selectedCountry);
        if (!countryData) return null;
        
        const citiesList = Object.values(countryData.cities);
        
        // Country account balance (on the country entity itself)
        const countryAccountBalance = countryData.totals;
        const countryAccountTotal = COLORS.reduce((s, c) => s + (countryAccountBalance[c] || 0), 0);
        
        // Sum of all cities' balances
        const citiesSumBalance = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
        citiesList.forEach(city => {
          COLORS.forEach(c => {
            citiesSumBalance[c] += city.totals[c] || 0;
          });
        });
        const citiesSumTotal = COLORS.reduce((s, c) => s + citiesSumBalance[c], 0);
        
        // Grand total
        const grandTotal = countryAccountTotal + citiesSumTotal;
        
        const colorConfigs = {
          BLACK: { gradient: 'from-gray-800 to-gray-900', icon: 'bg-gray-600', text: 'text-white', subtext: 'text-gray-300', dot: 'bg-gray-300' },
          WHITE: { gradient: 'from-gray-100 to-gray-200 border border-gray-300', icon: 'bg-white border-2 border-gray-400', text: 'text-gray-800', subtext: 'text-gray-500', dot: 'bg-gray-600' },
          RED: { gradient: 'from-red-500 to-red-600', icon: 'bg-red-400', text: 'text-white', subtext: 'text-red-100', dot: 'bg-white' },
          BLUE: { gradient: 'from-blue-500 to-blue-600', icon: 'bg-blue-400', text: 'text-white', subtext: 'text-blue-100', dot: 'bg-white' },
        };
        
        return (
          <div className="space-y-4">
            {/* Grand Total Summary */}
            <div className="bg-surface-card rounded-xl border border-edge p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                    <Package size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-content-muted">Итого по стране</p>
                    <p className="text-2xl font-bold text-content-primary">{grandTotal.toLocaleString()} браслетов</p>
                  </div>
                </div>
                <BraceletRow items={{ 
                  BLACK: (countryAccountBalance.BLACK || 0) + (citiesSumBalance.BLACK || 0),
                  WHITE: (countryAccountBalance.WHITE || 0) + (citiesSumBalance.WHITE || 0),
                  RED: (countryAccountBalance.RED || 0) + (citiesSumBalance.RED || 0),
                  BLUE: (countryAccountBalance.BLUE || 0) + (citiesSumBalance.BLUE || 0)
                }} size="md" />
              </div>
            </div>
            
            {/* Country Account Balance */}
            <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-edge px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/25">
                    <Building2 size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">Баланс аккаунта {countryData.name}</h3>
                    <p className="text-sm text-content-muted">Браслеты на аккаунте страны (не распределены по городам)</p>
                  </div>
                  <div className="ml-auto px-4 py-2 bg-amber-500/20 rounded-xl">
                    <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{countryAccountTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {COLORS.map((type) => {
                    const cfg = colorConfigs[type];
                    const value = countryAccountBalance[type] || 0;
                    return (
                      <div key={type} className={`bg-gradient-to-br ${cfg.gradient} rounded-xl p-4 shadow-lg hover:shadow-xl transition-shadow`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${cfg.icon} rounded-lg flex items-center justify-center shadow-inner`}>
                            <div className={`w-4 h-4 rounded-full ${cfg.dot}`} />
                          </div>
                          <div>
                            <p className={`text-2xl font-bold ${cfg.text}`}>{value.toLocaleString()}</p>
                            <p className={`text-xs ${cfg.subtext}`}>{COLOR_LABELS[type]}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Cities Sum Balance */}
            <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-b border-edge px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <MapPin size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">Суммарный баланс городов</h3>
                    <p className="text-sm text-content-muted">{citiesList.length} {citiesList.length === 1 ? 'город' : citiesList.length < 5 ? 'города' : 'городов'}</p>
                  </div>
                  <div className="ml-auto px-4 py-2 bg-blue-500/20 rounded-xl">
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{citiesSumTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {/* Sum cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {COLORS.map((type) => {
                    const cfg = colorConfigs[type];
                    const value = citiesSumBalance[type] || 0;
                    return (
                      <div key={type} className={`bg-gradient-to-br ${cfg.gradient} rounded-xl p-4 shadow-lg hover:shadow-xl transition-shadow`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${cfg.icon} rounded-lg flex items-center justify-center shadow-inner`}>
                            <div className={`w-4 h-4 rounded-full ${cfg.dot}`} />
                          </div>
                          <div>
                            <p className={`text-2xl font-bold ${cfg.text}`}>{value.toLocaleString()}</p>
                            <p className={`text-xs ${cfg.subtext}`}>{COLOR_LABELS[type]}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Cities list */}
                {citiesList.length > 0 && (
                  <div className="border-t border-edge pt-4">
                    <h4 className="text-sm font-semibold text-content-primary mb-3 flex items-center gap-2">
                      <MapPin size={14} className="text-content-muted" />
                      Детализация по городам
                    </h4>
                    <div className="space-y-2">
                      {citiesList.sort((a, b) => a.name.localeCompare(b.name)).map((city) => {
                        const cityTotal = Object.values(city.totals).reduce((s, v) => s + v, 0);
                        return (
                          <div
                            key={city.id}
                            onClick={() => {
                              setSelectedCity(city.id);
                              handleCitySelect({ target: { value: city.id } });
                            }}
                            className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary/50 hover:bg-surface-card-hover border border-transparent hover:border-brand-200 dark:hover:border-brand-700 cursor-pointer transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-surface-card rounded-lg flex items-center justify-center group-hover:bg-brand-500/10 transition-colors">
                                <MapPin size={16} className="text-brand-500" />
                              </div>
                              <span className="font-medium text-content-primary group-hover:text-brand-500 transition-colors">{city.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <BraceletRow items={{ BLACK: city.totals.BLACK || 0, WHITE: city.totals.WHITE || 0, RED: city.totals.RED || 0, BLUE: city.totals.BLUE || 0 }} size="sm" />
                              <span className="px-3 py-1 bg-content-primary/10 rounded-lg text-sm font-bold text-content-primary group-hover:bg-brand-500 group-hover:text-white transition-all">{cityTotal}</span>
                              <ChevronRight size={16} className="text-content-muted group-hover:text-brand-500 transition-colors" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {citiesList.length === 0 && (
                  <div className="text-center py-6 text-content-muted">
                    <MapPin size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Нет городов в этой стране</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CITY VIEW: Balance display for selected city ────── */}
      {isAdminOrOffice && selectedCity && (() => {
        const colorConfigs = {
          BLACK: { gradient: 'from-gray-800 to-gray-900', icon: 'bg-gray-600', text: 'text-white', subtext: 'text-gray-300', dot: 'bg-gray-300' },
          WHITE: { gradient: 'from-gray-100 to-gray-200 border border-gray-300', icon: 'bg-white border-2 border-gray-400', text: 'text-gray-800', subtext: 'text-gray-500', dot: 'bg-gray-600' },
          RED: { gradient: 'from-red-500 to-red-600', icon: 'bg-red-400', text: 'text-white', subtext: 'text-red-100', dot: 'bg-white' },
          BLUE: { gradient: 'from-blue-500 to-blue-600', icon: 'bg-blue-400', text: 'text-white', subtext: 'text-blue-100', dot: 'bg-white' },
        };
        
        return (
          <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-edge px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Package size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-content-primary">Баланс города</h3>
                  <p className="text-sm text-content-muted">{totalBracelets.toLocaleString()} браслетов всего</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {COLORS.map((type) => {
                  const cfg = colorConfigs[type];
                  const value = balanceMap[type] || 0;
                  return (
                    <div key={type} className={`bg-gradient-to-br ${cfg.gradient} rounded-xl p-4 shadow-lg hover:shadow-xl transition-shadow`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${cfg.icon} rounded-lg flex items-center justify-center shadow-inner`}>
                          <div className={`w-4 h-4 rounded-full ${cfg.dot}`} />
                        </div>
                        <div>
                          <p className={`text-2xl font-bold ${cfg.text}`}>{value.toLocaleString()}</p>
                          <p className={`text-xs ${cfg.subtext}`}>{COLOR_LABELS[type]}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* Balance display for COUNTRY/CITY users (non-admin) */}
      {!isAdminOrOffice && balances.length > 0 && (() => {
        const colorConfigs = {
          BLACK: { gradient: 'from-gray-800 to-gray-900', icon: 'bg-gray-600', text: 'text-white', subtext: 'text-gray-300', dot: 'bg-gray-300' },
          WHITE: { gradient: 'from-gray-100 to-gray-200 border border-gray-300', icon: 'bg-white border-2 border-gray-400', text: 'text-gray-800', subtext: 'text-gray-500', dot: 'bg-gray-600' },
          RED: { gradient: 'from-red-500 to-red-600', icon: 'bg-red-400', text: 'text-white', subtext: 'text-red-100', dot: 'bg-white' },
          BLUE: { gradient: 'from-blue-500 to-blue-600', icon: 'bg-blue-400', text: 'text-white', subtext: 'text-blue-100', dot: 'bg-white' },
        };
        return (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Package size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-content-primary">Текущий баланс</h3>
                <p className="text-sm text-content-muted">{totalBracelets.toLocaleString()} браслетов всего</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {COLORS.map((type) => {
                const cfg = colorConfigs[type];
                return (
                  <div key={type} className={`bg-gradient-to-br ${cfg.gradient} rounded-xl p-4 shadow-lg`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${cfg.icon} rounded-lg flex items-center justify-center shadow-inner`}>
                        <div className={`w-4 h-4 rounded-full ${cfg.dot}`} />
                      </div>
                      <div>
                        <p className={`text-2xl font-bold ${cfg.text}`}>{(balanceMap[type] || 0).toLocaleString()}</p>
                        <p className={`text-xs ${cfg.subtext}`}>{COLOR_LABELS[type]}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
      
      {!isAdminOrOffice && balances.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет данных</p>
        </Card>
      )}
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
              onClick={() => handleAdjust('plus')}
              className="flex-1"
            >
              <Plus size={16} /> Добавить
            </Button>
            <Button
              onClick={() => handleAdjust('minus')}
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

      {/* 2FA Modal for balance adjustment */}
      <TwoFactorModal
        isOpen={showAdjust2FA}
        onClose={() => { setShowAdjust2FA(false); setPendingAdjustData(null); }}
        onConfirm={handleAdjust2FAConfirm}
        title="Подтвердите корректировку баланса"
        description={pendingAdjustData ? `${pendingAdjustData.delta > 0 ? '+' : ''}${pendingAdjustData.delta} ${COLOR_LABELS[pendingAdjustData.itemType] || pendingAdjustData.itemType}${pendingAdjustData.reason ? ` — ${pendingAdjustData.reason}` : ''}` : ''}
        confirmButtonText="Подтвердить"
        confirmButtonVariant="primary"
        isLoading={adjusting}
      />
    </div>
  );
}
