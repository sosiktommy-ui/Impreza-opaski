import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import { BraceletRow } from '../components/ui/BraceletBadge';
import Badge from '../components/ui/Badge';
import { Send, PackageCheck, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [balance, setBalance] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const promises = [];

      // Balance for non-admin
      if (user.role !== 'ADMIN') {
        const entityType = user.role === 'COUNTRY' ? 'COUNTRY' : 'CITY';
        const entityId = user.role === 'COUNTRY' ? user.countryId : user.cityId;
        promises.push(inventoryApi.getBalance(entityType, entityId));
      } else {
        promises.push(Promise.resolve(null));
      }

      // Pending incoming
      promises.push(transfersApi.getPending());

      const [balRes, pendRes] = await Promise.all(promises);
      if (balRes) {
        const data = balRes.data?.data || balRes.data;
        setBalance(Array.isArray(data) ? data : []);
      }
      if (pendRes) {
        const data = pendRes.data?.data || pendRes.data;
        setPending(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const entityLabel =
    user.role === 'ADMIN' ? 'Администратор' :
    user.role === 'COUNTRY' ? user.country?.name || 'Страна' :
    user.city?.name || 'Город';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Привет, {user.displayName}!</h2>
        <p className="text-sm text-gray-500 mt-0.5">{entityLabel}</p>
      </div>

      {/* Balance card */}
      {balance && (
        <Card title="Текущий остаток">
          <BraceletRow
            items={balance.reduce((acc, b) => {
              acc[b.itemType] = b.quantity;
              return acc;
            }, {})}
          />
        </Card>
      )}

      {user.role === 'ADMIN' && (
        <Card title="Панель администратора">
          <p className="text-sm text-gray-500">
            Вы можете отправлять браслеты в любую страну или город.
            Используйте раздел «Отправки» для создания новых отправок.
          </p>
        </Card>
      )}

      {/* Pending incoming */}
      {pending.length > 0 && (
        <Card
          title={`Ожидают приёмки (${pending.length})`}
          className="border-yellow-200"
        >
          <div className="space-y-3">
            {pending.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
              >
                <div>
                  <div className="text-sm font-medium">
                    От: {t.sender?.displayName || 'Админ'}
                  </div>
                  <div className="mt-1">
                    <BraceletRow items={t.items} size="sm" />
                  </div>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {user.role !== 'ADMIN' && balance && (
          <>
            {balance.map((b) => (
              <div key={b.itemType} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
                <div className="text-2xl font-bold text-gray-800">{b.quantity}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {{ BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' }[b.itemType]}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
