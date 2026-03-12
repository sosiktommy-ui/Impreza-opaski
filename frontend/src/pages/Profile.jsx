import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { profileApi } from '../api/profile';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import { Lock, Save, Check } from 'lucide-react';

const ROLE_LABELS = { ADMIN: 'Администратор', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

function Avatar({ url, name, size = 'lg' }) {
  const sizes = { sm: 'w-10 h-10 text-sm', md: 'w-16 h-16 text-xl', lg: 'w-24 h-24 text-3xl' };
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover border-2 border-edge`}
      />
    );
  }
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className={`${sizes[size]} rounded-full bg-brand-100 dark:bg-brand-900 text-brand-500 flex items-center justify-center font-bold border-2 border-brand-200 dark:border-brand-800`}
    >
      {initials}
    </div>
  );
}

export default function Profile() {
  const { checkAuth } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await profileApi.get();
      const p = data.data || data;
      setProfile(p);
      setDisplayName(p.displayName || '');
      setEmail(p.email || '');
      setAvatarUrl(p.avatarUrl || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await profileApi.update({
        displayName,
        email: email || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      setSuccess('Профиль обновлён');
      await checkAuth();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPassword !== confirmPassword) {
      setPwError('Пароли не совпадают');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Минимум 6 символов');
      return;
    }
    setPwSaving(true);
    try {
      await profileApi.changePassword(currentPassword, newPassword);
      setPwSuccess('Пароль изменён');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(''), 3000);
    } catch (err) {
      setPwError(err.response?.data?.message || 'Ошибка смены пароля');
    } finally {
      setPwSaving(false);
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
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-content-primary">Профиль</h2>

      {/* Header card */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 rounded-[var(--radius-md)] p-6 text-white">
        <div className="flex items-center gap-5">
          <Avatar url={avatarUrl} name={displayName} size="lg" />
          <div>
            <h3 className="text-2xl font-bold">{profile?.displayName}</h3>
            <p className="text-brand-100 text-sm">@{profile?.username}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge>{ROLE_LABELS[profile?.role] || profile?.role}</Badge>
              {profile?.office && (
                <span className="text-xs text-brand-200">{profile.office.name}</span>
              )}
              {profile?.country && (
                <span className="text-xs text-brand-200">{profile.country.name}</span>
              )}
              {profile?.city && (
                <span className="text-xs text-brand-200">{profile.city.name}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <Card title="Редактировать профиль">
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Отображаемое имя"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Необязательно"
          />
          <Input
            label="URL аватара"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
          />
          {avatarUrl && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-content-secondary">Предпросмотр:</span>
              <Avatar url={avatarUrl} name={displayName} size="sm" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] flex items-center gap-2">
              <Check size={16} /> {success}
            </div>
          )}

          <Button type="submit" loading={saving}>
            <Save size={16} /> Сохранить
          </Button>
        </form>
      </Card>

      {/* Change password */}
      <Card title="Сменить пароль">
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <Input
            label="Текущий пароль"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="Новый пароль"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            placeholder="Минимум 6 символов"
          />
          <Input
            label="Подтвердите новый пароль"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {pwError && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] flex items-center gap-2">
              <Check size={16} /> {pwSuccess}
            </div>
          )}

          <Button type="submit" loading={pwSaving} variant="outline">
            <Lock size={16} /> Сменить пароль
          </Button>
        </form>
      </Card>
    </div>
  );
}
