import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { BraceletRow } from '../components/ui/BraceletBadge';
import {
  TrendingDown, Search, RefreshCw, AlertTriangle,
  ArrowRight, Calendar, User,
} from 'lucide-react';

const RESOLUTION_LABELS = {
  ACCEPT_SENDER: 'Доверяем отправителю',
  ACCEPT_RECEIVER: 'Доверяем получателю',
  ACCEPT_COMPROMISE: 'Компромисс',
  CANCEL_TRANSFER: 'Трансфер отменён',
};

export default function CompanyLosses() {
  const { user } = useAuthStore();
  const [summary, setSummary] = useState(null);
  const [losses, setLosses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const TAKE = 20;

  // Only ADMIN/OFFICE can view
  const canAccess = user?.role === 'ADMIN' || user?.role === 'OFFICE';

  useEffect(() => {
    if (canAccess) {
      loadData();
    }
  }, [canAccess]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadSummary(), loadLosses(true)]);
    } catch (err) {
      setError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const { data } = await inventoryApi.getCompanyLossesSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load summary', err);
    }
  };

  const loadLosses = async (reset = false) => {
    try {
      const skip = reset ? 0 : page * TAKE;
      const params = { skip, take: TAKE };
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const { data } = await inventoryApi.getCompanyLosses(params);
      const list = data?.data || data;
      const items = Array.isArray(list) ? list : [];

      if (reset) {
        setLosses(items);
        setPage(1);
      } else {
        setLosses((prev) => [...prev, ...items]);
        setPage((p) => p + 1);
      }
      setHasMore(items.length === TAKE);
    } catch (err) {
      console.error('Failed to load losses', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadLosses(true);
  };

  const handleRefresh = () => {
    setSearchQuery('');
    loadData();
  };

  const handleLoadMore = () => {
    loadLosses(false);
  };

  // Stats from summary
  const stats = useMemo(() => {
    if (!summary) return { total: 0, black: 0, white: 0, red: 0, blue: 0, count: 0 };
    return {
      total: summary.totalAmount || 0,
      black: summary.black || 0,
      white: summary.white || 0,
      red: summary.red || 0,
      blue: summary.blue || 0,
      count: summary.count || 0,
    };
  }, [summary]);

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-content-muted">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
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
            <TrendingDown size={22} className="text-red-500" /> Минус компании
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Потери браслетов при разрешении проблемных трансферов
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* ── Summary Stats ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown size={18} className="text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{stats.total.toLocaleString()}</div>
              <div className="text-xs text-content-muted">Всего потерь</div>
            </div>
          </div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="text-2xl font-bold text-content-primary">{stats.count}</div>
          <div className="text-xs text-content-muted">Инцидентов</div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{stats.black}</div>
          <div className="text-xs text-content-muted">Чёрные</div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="text-2xl font-bold text-gray-400">{stats.white}</div>
          <div className="text-xs text-content-muted">Белые</div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="text-2xl font-bold text-red-500">{stats.red}</div>
          <div className="text-xs text-content-muted">Красные</div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="text-2xl font-bold text-blue-500">{stats.blue}</div>
          <div className="text-xs text-content-muted">Синие</div>
        </div>
      </div>

      {/* ── Search ────────────────────────────────────── */}
      <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="Поиск по отправителю, получателю, городу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" variant="outline">
            <Search size={18} />
          </Button>
        </form>
      </div>

      {/* ── Losses List ───────────────────────────────── */}
      <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge">
        <div className="divide-y divide-edge">
          {losses.length === 0 ? (
            <div className="p-8 text-center text-content-muted">
              <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
              <p>Потерь не зафиксировано</p>
            </div>
          ) : (
            losses.map((loss) => (
              <div key={loss.id} className="p-4 hover:bg-surface-hover transition-colors">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Route info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
                      <span className="truncate">{loss.senderName}</span>
                      {loss.senderCity && (
                        <span className="text-content-muted text-xs">({loss.senderCity})</span>
                      )}
                      <ArrowRight size={14} className="text-content-muted flex-shrink-0" />
                      <span className="truncate">{loss.receiverName}</span>
                      {loss.receiverCity && (
                        <span className="text-content-muted text-xs">({loss.receiverCity})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-content-muted">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(loss.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                      {loss.resolvedByUser && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {loss.resolvedByUser.displayName || loss.resolvedByUser.username}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        loss.resolutionType === 'CANCEL_TRANSFER'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                      }`}>
                        {RESOLUTION_LABELS[loss.resolutionType] || loss.resolutionType}
                      </span>
                    </div>

                    <div className="text-xs text-content-secondary mt-1">
                      Отправлено: {loss.originalSent} → Получено: {loss.originalReceived}
                    </div>

                    {loss.notes && (
                      <div className="text-xs text-content-muted mt-1 italic truncate">
                        {loss.notes}
                      </div>
                    )}
                  </div>

                  {/* Right: Loss amount */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-xl font-bold text-red-600">
                      −{loss.totalAmount}
                    </div>
                    <BraceletRow black={loss.black} white={loss.white} red={loss.red} blue={loss.blue} size="sm" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Load more */}
        {hasMore && losses.length > 0 && (
          <div className="p-4 border-t border-edge text-center">
            <Button variant="outline" size="sm" onClick={handleLoadMore}>
              Загрузить ещё
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
