import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Crown, Building2, Globe, MapPin, User as UserIcon, RefreshCw } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import BraceletBadge from '../components/ui/BraceletBadge';
import { balancesApi } from '../api/balances';

const COLOR_KEYS = ['BLACK', 'WHITE', 'RED', 'BLUE'];

function BalRow({ data }) {
  return (
    <div className="flex items-center gap-2">
      {COLOR_KEYS.map((k) => (
        <BraceletBadge key={k} type={k} count={data?.[k.toLowerCase()] ?? 0} size="sm" />
      ))}
      <span className="ml-1 text-xs font-semibold text-content-secondary">
        Σ {data?.total ?? 0}
      </span>
    </div>
  );
}

function Node({ icon: Icon, title, subtitle, balance, children, defaultOpen = false, accent = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!children;
  return (
    <div className="border border-edge rounded-[var(--radius-md)] bg-surface-card">
      <button
        type="button"
        onClick={() => hasChildren && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${hasChildren ? 'hover:bg-surface-card-hover cursor-pointer' : 'cursor-default'}`}
      >
        {hasChildren ? (
          open ? <ChevronDown size={16} className="text-content-muted shrink-0" /> : <ChevronRight size={16} className="text-content-muted shrink-0" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Icon size={18} className={`shrink-0 ${accent || 'text-content-muted'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-content-primary truncate">{title}</div>
          {subtitle && <div className="text-xs text-content-muted truncate">{subtitle}</div>}
        </div>
        <BalRow data={balance} />
      </button>
      {hasChildren && open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-edge bg-surface-secondary/30">
          {children}
        </div>
      )}
    </div>
  );
}

export default function BalancesOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: resp } = await balancesApi.getOverview();
      setData(resp?.data || resp);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="p-6 text-sm text-content-muted">Загрузка...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-sm text-red-500">{error}</div>
          <Button onClick={load} variant="outline" className="mt-3">Повторить</Button>
        </Card>
      </div>
    );
  }

  const admins = data?.admins || [];
  const offices = data?.offices || [];

  const adminsTotal = admins.reduce(
    (acc, a) => ({
      black: acc.black + (a.black || 0),
      white: acc.white + (a.white || 0),
      red: acc.red + (a.red || 0),
      blue: acc.blue + (a.blue || 0),
      total: acc.total + (a.total || 0),
    }),
    { black: 0, white: 0, red: 0, blue: 0, total: 0 }
  );

  const officesTotal = offices.reduce(
    (acc, o) => ({
      black: acc.black + (o.grandTotal?.black || 0),
      white: acc.white + (o.grandTotal?.white || 0),
      red: acc.red + (o.grandTotal?.red || 0),
      blue: acc.blue + (o.grandTotal?.blue || 0),
      total: acc.total + (o.grandTotal?.total || 0),
    }),
    { black: 0, white: 0, red: 0, blue: 0, total: 0 }
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Балансы — общий вид</h2>
          <p className="text-xs text-content-muted">Личные склады админов и офисов, по странам, городам и пользователям</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw size={14} /> Обновить
        </Button>
      </div>

      {/* Admins block */}
      <Node
        icon={Crown}
        title="Админы (личные склады)"
        subtitle={`${admins.length} админ${admins.length === 1 ? '' : admins.length < 5 ? 'а' : 'ов'}`}
        balance={adminsTotal}
        defaultOpen={admins.length > 0}
        accent="text-amber-500"
      >
        {admins.length === 0 ? (
          <div className="text-xs text-content-muted px-3 py-2">Нет активных админов</div>
        ) : (
          admins.map((a) => (
            <Node
              key={a.id}
              icon={UserIcon}
              title={a.displayName || a.username}
              subtitle={`@${a.username}`}
              balance={{ black: a.black, white: a.white, red: a.red, blue: a.blue, total: a.total }}
              accent="text-amber-500"
            />
          ))
        )}
      </Node>

      {/* Offices block */}
      <Node
        icon={Building2}
        title="Офисы"
        subtitle={`${offices.length} офис${offices.length === 1 ? '' : offices.length < 5 ? 'а' : 'ов'} (включая страны и пользователей)`}
        balance={officesTotal}
        defaultOpen={offices.length > 0}
        accent="text-brand-500"
      >
        {offices.length === 0 ? (
          <div className="text-xs text-content-muted px-3 py-2">Нет офисов</div>
        ) : (
          offices.map((o) => (
            <Node
              key={o.id}
              icon={Building2}
              title={o.name}
              subtitle={`Код: ${o.code} · склад Σ ${o.warehouse?.total ?? 0} · пользователи Σ ${o.usersTotal?.total ?? 0}`}
              balance={o.grandTotal}
              accent="text-brand-500"
            >
              <Node
                icon={Building2}
                title="Склад офиса"
                balance={o.warehouse}
                accent="text-purple-500"
              />
              {(o.countries || []).length === 0 && (
                <div className="text-xs text-content-muted px-3 py-2">Нет привязанных стран</div>
              )}
              {(o.countries || []).map((co) => (
                <Node
                  key={co.id}
                  icon={Globe}
                  title={co.name}
                  subtitle={co.code}
                  balance={{ black: co.black, white: co.white, red: co.red, blue: co.blue, total: co.total }}
                  accent="text-emerald-500"
                >
                  {(co.cities || []).length === 0 && (
                    <div className="text-xs text-content-muted px-3 py-2">Нет городов</div>
                  )}
                  {(co.cities || []).map((ct) => (
                    <Node
                      key={ct.id}
                      icon={MapPin}
                      title={ct.name}
                      subtitle={ct.slug}
                      balance={{ black: ct.black, white: ct.white, red: ct.red, blue: ct.blue, total: ct.total }}
                      accent="text-sky-500"
                    >
                      {(ct.users || []).length === 0 ? (
                        <div className="text-xs text-content-muted px-3 py-2">Нет пользователей</div>
                      ) : (
                        ct.users.map((u) => (
                          <Node
                            key={u.id}
                            icon={UserIcon}
                            title={u.displayName || u.username}
                            subtitle={`@${u.username}`}
                            balance={{ black: u.black, white: u.white, red: u.red, blue: u.blue, total: u.total }}
                          />
                        ))
                      )}
                    </Node>
                  ))}
                </Node>
              ))}
            </Node>
          ))
        )}
      </Node>
    </div>
  );
}
