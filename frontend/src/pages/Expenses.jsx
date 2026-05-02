import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import ExpenseNewModal from '../components/domain/ExpenseNewModal';
import { listExpenses, deleteExpense, EXPENSE_KINDS, EXPENSE_KIND_MAP } from '../api/expenses';
import { COLORS } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';

const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.id, c]));

const KIND_FILTERS = [{ id: '', label: 'Все' }, ...EXPENSE_KINDS.map((k) => ({ id: k.id, label: k.label }))];

export default function Expenses() {
  const { user } = useAuthStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kindFilter, setKindFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const canCreate = user && user.role !== 'COUNTRY';
  const canDelete = user?.role === 'ADMIN';

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const params = kindFilter ? { kind: kindFilter } : {};
      const res = await listExpenses(params);
      setItems(res || []);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter]);

  async function onDelete(id) {
    if (!confirm('Удалить запись расхода? Действие необратимо.')) return;
    setBusyId(id);
    try {
      await deleteExpense(id);
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'DELETE_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Header
        title="Расходы"
        subtitle="Списания: промо, потери, брак, недостачи"
        right={
          canCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
              + Списать
            </button>
          )
        }
      />

      <div className="p-6 md:p-8 fade-in">
        <div className="flex items-center gap-1 mb-5 p-1 inline-flex rounded-[10px] flex-wrap" style={{ background: 'var(--surface)' }}>
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              onClick={() => setKindFilter(f.id)}
              className="px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                background: kindFilter === f.id ? 'var(--surface-2)' : 'transparent',
                color: kindFilter === f.id ? 'var(--text)' : 'var(--text-2)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-4 shimmer" style={{ height: 64 }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-text-3 text-3xl mb-3">€</div>
            <h2 className="text-[15px] font-semibold">Расходов пока нет</h2>
            <p className="text-text-2 text-sm mt-1">Добавьте первое списание, если оно было.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Город</th>
                  <th>Тип</th>
                  <th>Цвет</th>
                  <th className="text-right">Кол-во</th>
                  <th>Причина</th>
                  <th>Кто</th>
                  {canDelete && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const k = EXPENSE_KIND_MAP[e.kind] || { label: e.kind, tone: 'muted' };
                  const c = COLOR_MAP[e.color];
                  return (
                    <tr key={e.id}>
                      <td className="mono text-xs text-text-2">
                        {new Date(e.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td>
                        <div className="font-medium">{e.city?.name || '—'}</div>
                        <div className="text-text-3 text-xs mono">{e.city?.country?.code || ''}</div>
                      </td>
                      <td><span className={`pill pill-${k.tone}`}>{k.label}</span></td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className={`swatch ${c?.sw || ''}`} style={{ width: 12, height: 12 }} />
                          <span className="text-sm">{c?.label || e.color}</span>
                        </span>
                      </td>
                      <td className="mono font-semibold text-right">{e.count}</td>
                      <td className="text-text-2 text-sm">{e.reason || '—'}</td>
                      <td className="text-text-2 text-sm">{e.createdBy?.displayName || e.createdBy?.username || '—'}</td>
                      {canDelete && (
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onDelete(e.id)}
                            disabled={busyId === e.id}
                            style={{ color: 'var(--danger)' }}
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExpenseNewModal open={newOpen} onClose={() => setNewOpen(false)} onDone={refresh} />
    </>
  );
}
