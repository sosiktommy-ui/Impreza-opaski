import { useState, useEffect } from 'react';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react';

const ROLE_LABELS = { ADMIN: 'Админ', COUNTRY: 'Страна', CITY: 'Город' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPassword, setShowPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [form, setForm] = useState({
    username: '', password: '', email: '', displayName: '',
    role: 'CITY', countryId: '', cityId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, countriesRes] = await Promise.all([
        usersApi.getAll(),
        usersApi.getCountries(),
      ]);
      setUsers(usersRes.data?.data || usersRes.data || []);
      setCountries(countriesRes.data?.data || countriesRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (e) => {
    const role = e.target.value;
    setForm((p) => ({ ...p, role, countryId: '', cityId: '' }));
    setCities([]);
  };

  const handleCountryChange = async (e) => {
    const cId = e.target.value;
    setForm((p) => ({ ...p, countryId: cId, cityId: '' }));
    if (cId && form.role === 'CITY') {
      const { data } = await usersApi.getCities(cId);
      setCities(data.data || data || []);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await usersApi.create({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        displayName: form.displayName,
        role: form.role,
        countryId: form.countryId || undefined,
        cityId: form.cityId || undefined,
      });
      setShowCreate(false);
      setForm({ username: '', password: '', email: '', displayName: '', role: 'CITY', countryId: '', cityId: '' });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Удалить пользователя ${name}?`)) return;
    try {
      await usersApi.remove(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка удаления');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Минимум 6 символов');
      return;
    }
    setSaving(true);
    try {
      await usersApi.resetPassword(showPassword, newPassword);
      setShowPassword(null);
      setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Пользователи</h2>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={18} /> Новый
        </Button>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-800">{u.displayName}</div>
                <div className="text-xs text-gray-400">
                  @{u.username} • <Badge>{ROLE_LABELS[u.role]}</Badge>
                  {u.country && ` • ${u.country.name}`}
                  {u.city && ` • ${u.city.name}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setShowPassword(u.id); setNewPassword(''); setError(''); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-600"
                  title="Сменить пароль"
                >
                  <KeyRound size={16} />
                </button>
                <button
                  onClick={() => handleDelete(u.id, u.displayName)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  title="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новый пользователь">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Логин"
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
          <Input
            label="Отображаемое имя"
            value={form.displayName}
            onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            required
          />
          <Input
            label="Email (необязательно)"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          <Select
            label="Роль"
            value={form.role}
            onChange={handleRoleChange}
            options={[
              { value: 'ADMIN', label: 'Админ' },
              { value: 'COUNTRY', label: 'Страна' },
              { value: 'CITY', label: 'Город' },
            ]}
          />
          {(form.role === 'COUNTRY' || form.role === 'CITY') && (
            <Select
              label="Страна"
              value={form.countryId}
              onChange={handleCountryChange}
              options={[
                { value: '', label: '— Выберите —' },
                ...countries.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
          {form.role === 'CITY' && cities.length > 0 && (
            <Select
              label="Город"
              value={form.cityId}
              onChange={(e) => setForm((p) => ({ ...p, cityId: e.target.value }))}
              options={[
                { value: '', label: '— Выберите —' },
                ...cities.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button type="submit" loading={saving} className="w-full">
            Создать
          </Button>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={!!showPassword}
        onClose={() => setShowPassword(null)}
        title="Сменить пароль"
      >
        <div className="space-y-4">
          <Input
            label="Новый пароль"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Минимум 6 символов"
          />
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <Button onClick={handleResetPassword} loading={saving} className="w-full">
            Сохранить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
