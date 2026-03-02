import { useState, useEffect } from 'react';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Acceptance() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectCounts, setRejectCounts] = useState({});
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    try {
      const { data } = await transfersApi.getPending();
      const result = data?.data || data;
      setPending(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── ACCEPT: one-click, no counting needed ──
  const handleAccept = async (transfer) => {
    if (!confirm('Принять отправку? Нажимая «Принять» вы подтверждаете что получили все браслеты.')) return;
    setProcessing(true);
    setError('');
    try {
      // Auto-fill receivedQuantity = sentQuantity (accept as-is)
      const items = (transfer.items || []).map((item) => ({
        itemType: item.itemType,
        receivedQuantity: item.quantity,
      }));
      await transfersApi.accept(transfer.id, items);
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка приёмки');
    } finally {
      setProcessing(false);
    }
  };

  // ── REJECT: open modal to count ──
  const openReject = (transfer) => {
    setRejectTarget(transfer);
    setRejectReason('');
    setError('');
    const counts = {};
    transfer.items?.forEach((item) => {
      counts[item.itemType] = '';
    });
    setRejectCounts(counts);
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget) return;
    setProcessing(true);
    setError('');

    try {
      // Parse counted quantities
      const counts = {};
      let totalCounted = 0;
      ITEM_TYPES.forEach((t) => {
        if (rejectCounts[t] !== undefined) {
          const val = parseInt(rejectCounts[t]) || 0;
          counts[t] = val;
          totalCounted += val;
        }
      });

      if (totalCounted === 0) {
        // All zeros — full rejection
        await transfersApi.reject(rejectTarget.id, rejectReason.trim() || 'Отклонено получателем');
      } else {
        // Has some counted bracelets — send through accept which detects discrepancy
        const items = ITEM_TYPES
          .filter((t) => rejectCounts[t] !== undefined)
          .map((t) => ({
            itemType: t,
            receivedQuantity: counts[t],
          }));
        await transfersApi.accept(rejectTarget.id, items);
      }

      setRejectTarget(null);
      setRejectReason('');
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  // Check what will happen based on current counts
  const getRejectPreview = () => {
    if (!rejectTarget) return null;
    let totalCounted = 0;
    let hasDiscrepancy = false;

    ITEM_TYPES.forEach((t) => {
      if (rejectCounts[t] !== undefined) {
        const counted = parseInt(rejectCounts[t]) || 0;
        totalCounted += counted;
        const sent = (rejectTarget.items || []).find((i) => i.itemType === t)?.quantity || 0;
        if (counted !== sent) hasDiscrepancy = true;
      }
    });

    if (totalCounted === 0) return { type: 'rejected', label: 'Полное отклонение — ничего не получено' };
    if (hasDiscrepancy) return { type: 'discrepancy', label: 'Расхождение — количество не совпадает с отправленным' };
    return { type: 'match', label: 'Количество совпадает с отправленным — лучше нажмите «Принять»' };
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
      <h2 className="text-xl font-bold text-gray-800">Приёмка</h2>

      {error && !rejectTarget && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg">{error}</div>
      )}

      {pending.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет входящих отправок</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => {
            const senderLabel =
              t.senderType === 'ADMIN'
                ? 'Админ'
                : t.senderType === 'OFFICE'
                  ? (t.senderOffice?.name || 'Офис')
                  : t.senderType === 'CITY'
                    ? `${t.senderCity?.name || '—'}${t.senderCity?.country?.name ? ` (${t.senderCity.country.name})` : ''}`
                    : t.senderCountry?.name || '—';
            const senderName = t.createdByUser?.displayName;

            return (
              <Card key={t.id}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        От: {senderLabel}
                      </div>
                      {senderName && (
                        <div className="text-xs text-gray-500">
                          Отправитель: <span className="font-medium text-gray-700">{senderName}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                          day: '2-digit', month: 'long', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <Badge status={t.status} />
                  </div>

                  {/* Color breakdown — hide quantities for blind acceptance */}
                  <div className="flex items-center gap-1.5">
                    {(t.items || []).map((item) => (
                      <BraceletBadge key={item.itemType || item.id} type={item.itemType} count="?" />
                    ))}
                    <span className="text-xs text-gray-400 ml-2">{t.items?.length || 0} цветов</span>
                  </div>

                  <div className="text-sm text-gray-500">
                    Принять = согласиться с отправленным количеством
                  </div>

                  {t.notes && <p className="text-xs text-gray-400">{t.notes}</p>}

                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => handleAccept(t)} loading={processing}>
                      <CheckCircle size={16} /> Принять
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => openReject(t)}
                    >
                      <AlertTriangle size={16} /> Есть проблема
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject / Discrepancy modal */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Проблема с отправкой"
      >
        {rejectTarget && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <AlertTriangle size={16} />
                Укажите сколько браслетов вы фактически насчитали.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Если ничего не получено — оставьте всё по 0.
              </p>
            </div>

            <div className="space-y-3">
              {rejectTarget.items?.map((item) => (
                <div key={item.itemType} className="flex items-center justify-between gap-4">
                  <div className="text-sm flex items-center gap-2">
                    <BraceletBadge type={item.itemType} count="?" size="sm" />
                    <span className="font-medium">{ITEM_LABELS[item.itemType]}</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={rejectCounts[item.itemType] ?? ''}
                    onChange={(e) =>
                      setRejectCounts((p) => ({ ...p, [item.itemType]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-24 text-center"
                  />
                </div>
              ))}
            </div>

            {/* Preview what will happen */}
            {(() => {
              const preview = getRejectPreview();
              if (!preview) return null;
              const colors = {
                rejected: 'bg-red-50 text-red-700 border-red-200',
                discrepancy: 'bg-orange-50 text-orange-700 border-orange-200',
                match: 'bg-green-50 text-green-700 border-green-200',
              };
              return (
                <div className={`text-xs px-3 py-2 rounded-lg border ${colors[preview.type]}`}>
                  {preview.label}
                </div>
              );
            })()}

            <Input
              label="Причина / комментарий"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Опишите проблему..."
            />

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <Button
              onClick={handleRejectSubmit}
              loading={processing}
              className="w-full"
              variant={getRejectPreview()?.type === 'match' ? 'primary' : 'danger'}
            >
              {getRejectPreview()?.type === 'rejected' ? (
                <><XCircle size={18} /> Отклонить</>
              ) : getRejectPreview()?.type === 'discrepancy' ? (
                <><AlertTriangle size={18} /> Отправить расхождение</>
              ) : (
                <><CheckCircle size={18} /> Подтвердить</>
              )}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
