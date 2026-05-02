import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import { listCountries, createCountry } from '../api/countries';
import { listCities, createCity } from '../api/cities';
import { useAuthStore } from '../store/useAuthStore';

export default function Geodata() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('countries');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const [co, ci] = await Promise.all([listCountries(), listCities()]);
      setCountries(co || []);
      setCities(ci || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  function openCreate() {
    setForm({});
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      if (tab === 'countries') {
        if (!form.code || !form.name) return setError('Укажите код и название');
        await createCountry({ code: form.code.toUpperCase(), name: form.name });
      } else {
        if (!form.countryId || !form.code || !form.name) return setError('Укажите страну, код и название');
        await createCity({ countryId: form.countryId, code: form.code.toLowerCase(), name: form.name });
      }
      await refresh();
      setModalOpen(false);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header
        title="География"
        subtitle="Страны и города"
        right={
          isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              + {tab === 'countries' ? 'Страна' : 'Город'}
            </button>
          )
        }
      />

      <div className="p-6 md:p-8 fade-in">
        <div className="flex items-center gap-1 mb-5 p-1 inline-flex rounded-[10px]" style={{ background: 'var(--surface)' }}>
          <TabBtn active={tab === 'countries'} onClick={() => setTab('countries')}>Страны ({countries.length})</TabBtn>
          <TabBtn active={tab === 'cities'} onClick={() => setTab('cities')}>Города ({cities.length})</TabBtn>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="card p-4 shimmer" style={{ height: 52 }} />)}
          </div>
        ) : tab === 'countries' ? (
          <div className="card overflow-hidden">
            <table className="table">
              <thead><tr><th>Код</th><th>Название</th><th>Городов</th></tr></thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.id}>
                    <td className="mono font-bold">{c.code}</td>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-text-3">{cities.filter(x => x.countryId === c.id).length}</td>
                  </tr>
                ))}
                {countries.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-text-3 py-8">Стран пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table">
              <thead><tr><th>Код</th><th>Город</th><th>Страна</th><th>Статус</th></tr></thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id}>
                    <td className="mono font-bold">{c.code}</td>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-text-2 mono text-xs">{c.countryCode} · {c.countryName}</td>
                    <td>
                      {c.isActive
                        ? <span className="pill pill-success">Активен</span>
                        : <span className="pill pill-muted">Отключён</span>}
                    </td>
                  </tr>
                ))}
                {cities.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-text-3 py-8">Городов пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={tab === 'countries' ? 'Новая страна' : 'Новый город'}
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>Отмена</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохраняем…' : 'Создать'}</button>
          </>
        }
      >
        <div className="space-y-3">
          {tab === 'cities' && (
            <div>
              <label className="label">Страна</label>
              <select className="select" value={form.countryId || ''} onChange={(e) => setForm({ ...form, countryId: e.target.value })}>
                <option value="">— выберите —</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">{tab === 'countries' ? 'Код страны (ISO 2)' : 'Код города'}</label>
            <input
              className="input mono"
              placeholder={tab === 'countries' ? 'DE' : 'berlin'}
              value={form.code || ''}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Название</label>
            <input
              className="input"
              placeholder={tab === 'countries' ? 'Germany' : 'Berlin'}
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          {error && (
            <div className="text-xs px-3 py-2 rounded-md" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-sm rounded-md transition-colors"
      style={{ background: active ? 'var(--surface-2)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-2)' }}
    >
      {children}
    </button>
  );
}
