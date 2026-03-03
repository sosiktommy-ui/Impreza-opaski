import { useState, useEffect, useMemo } from 'react';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, KeyRound, Search, UserCheck, UserX } from 'lucide-react';

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState([]);
  const [offices, setOffices] = useState([]);
  const [cities, setCities] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showPassword, setShowPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Create form
  const [form, setForm] = useState({
    username: '', password: '', email: '', displayName: '',
    role: 'CITY', countryId: '', cityId: '', officeId: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    displayName: '', email: '', role: '', countryId: '', cityId: '', officeId: '', isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const promises = [usersApi.getAll({ limit: 500 }), usersApi.getCountries()];
      // try to load offices (may fail if endpoint doesn't exist yet)
      promises.push(usersApi.getOffices().catch(() => ({ data: [] })));
      const [usersRes, countriesRes, officesRes] = await Promise.all(promises);
      const uData = usersRes.data;
      setUsers(Array.isArray(uData) ? uData : (uData?.data || []));
      const cData = countriesRes.data;
      setCountries(Array.isArray(cData) ? cData : (cData?.data || cData || []));
      const oData = officesRes.data;
      setOffices(Array.isArray(oData) ? oData : (oData?.data || oData || []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.country?.name || '').toLowerCase().includes(q) ||
        (u.city?.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleFilter, searchQuery]);

  const handleRoleChange = (e) => {
    const role = e.target.value;
    setForm((p) => ({ ...p, role, countryId: '', cityId: '', officeId: '' }));
    setCities([]);
  };

  const handleCountryChange = async (e) => {
    const cId = e.target.value;
    setForm((p) => ({ ...p, countryId: cId, cityId: '' }));
    if (cId && form.role === 'CITY') {
      const { data } = await usersApi.getCities(cId);
      setCities(Array.isArray(data) ? data : (data?.data || data || []));
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
        officeId: form.officeId || undefined,
      });
      setShowCreate(false);
      setForm({ username: '', password: '', email: '', displayName: '', role: 'CITY', countryId: '', cityId: '', officeId: '' });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u) => {
    setEditForm({
      displayName: u.displayName || '',
      email: u.email || '',
      role: u.role,
      countryId: u.countryId || '',
      cityId: u.cityId || '',
      officeId: u.officeId || '',
      isActive: u.isActive !== false,
    });
    setShowEdit(u);
    setError('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await usersApi.update(showEdit.id, {
        displayName: editForm.displayName,
        email: editForm.email || undefined,
        isActive: editForm.isActive,
      });
      setShowEdit(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка обновления');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await usersApi.update(u.id, { isActive: !u.isActive });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка');
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
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Пользователи</h2>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={18} /> Новый
        </Button>
      </div>

      {/* Search & role filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по имени, логину, email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'ADMIN', 'OFFICE', 'COUNTRY', 'CITY'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                roleFilter === r
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {r === 'all' ? 'Все' : ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-400">{filteredUsers.length} из {users.length} пользователей</div>

      <div className="space-y-2">
        {filteredUsers.map((u) => (
          <Card key={u.id}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${u.isActive === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {u.displayName}
                  </span>
                  {u.isActive === false && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      неактивен
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  @{u.username}
                  {u.email && ` • ${u.email}`}
                  <span className="ml-1">
                    • <span className="inline-flex"><Badge>{ROLE_LABELS[u.role] || u.role}</Badge></span>
                  </span>
                  {u.office && ` • ${u.office.name}`}
                  {u.country && ` • ${u.country.name}`}
                  {u.city && ` • ${u.city.name}`}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button
                  onClick={() => toggleActive(u)}
                  className={`p-1.5 rounded-lg hover:bg-gray-100 ${u.isActive === false ? 'text-green-500' : 'text-gray-400 hover:text-orange-500'}`}
                  title={u.isActive === false ? 'Активировать' : 'Деактивировать'}
                >
                  {u.isActive === false ? <UserCheck size={16} /> : <UserX size={16} />}
                </button>
                <button
                  onClick={() => openEdit(u)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-600"
                  title="Редактировать"
                >
                  <Pencil size={16} />
                </button>
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
              { value: 'OFFICE', label: 'Офис' },
              { value: 'COUNTRY', label: 'Страна' },
              { value: 'CITY', label: 'Город' },
            ]}
          />
          {form.role === 'OFFICE' && (
            offices.length > 0 ? (
              <Select
                label="Офис"
                value={form.officeId}
                onChange={(e) => setForm((p) => ({ ...p, officeId: e.target.value }))}
                options={[
                  { value: '', label: '— Выберите офис —' },
                  ...offices.map((o) => ({ value: o.id, label: o.name })),
                ]}
              />
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm px-3 py-2 rounded-lg">
                Нет доступных офисов. Создайте офис в базе данных.
              </div>
            )
          )}
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

      {/* Edit user modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Редактировать пользователя">
        {showEdit && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="text-sm text-gray-500 mb-2">
              @{showEdit.username} • {ROLE_LABELS[showEdit.role]}
            </div>
            <Input
              label="Отображаемое имя"
              value={editForm.displayName}
              onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value }))}
              required
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
            />
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-700">Аккаунт активен</span>
              <button
                type="button"
                onClick={() => setEditForm((p) => ({ ...p, isActive: !p.isActive }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${editForm.isActive ? 'bg-brand-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.isActive ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <Button type="submit" loading={saving} className="w-full">
              Сохранить
            </Button>
          </form>
        )}
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
