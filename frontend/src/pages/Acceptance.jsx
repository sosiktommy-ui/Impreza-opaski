import { useState, useEffect } from 'react';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import { CheckCircle, XCircle, AlertTriangle, Package } from 'lucide-react';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Acceptance() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  // Accept confirmation modal
  const [acceptTarget, setAcceptTarget] = useState(null);

  // Disagree modal state
  const [disagreeTarget, setDisagreeTarget] = useState(null);
  const [disagreeCounts, setDisagreeCounts] = useState({});
  const [disagreeReason, setDisagreeReason] = useState('');

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

  // ── ACCEPT: modal with quantities shown, confirm button ──
  const openAccept = (transfer) => {
    setAcceptTarget(transfer);
    setError('');
  };

  const handleAcceptConfirm = async () => {
    if (!acceptTarget) return;
    setProcessing(true);
    setError('');
    try {
      const items = (acceptTarget.items || []).map((item) => ({
        itemType: item.itemType,
        receivedQuantity: item.quantity,
      }));
      await transfersApi.accept(acceptTarget.id, items);
      setAcceptTarget(null);
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка приёмки');
    } finally {
      setProcessing(false);
    }
  };

  // ── DISAGREE: open modal to count what was actually received ──
  const openDisagree = (transfer) => {
    setDisagreeTarget(transfer);
    setDisagreeReason('');
    setError('');
    const counts = {};
    transfer.items?.forEach((item) => {
      counts[item.itemType] = '';
    });
    setDisagreeCounts(counts);
  };

  const handleDisagreeSubmit = async () => {
    if (!disagreeTarget) return;
    setProcessing(true);
    setError('');

    try {
      const counts = {};
      let totalCounted = 0;
      ITEM_TYPES.forEach((t) => {
        if (disagreeCounts[t] !== undefined) {
          const val = parseInt(disagreeCounts[t]) || 0;
          counts[t] = val;
          totalCounted += val;
        }
      });

      if (totalCounted === 0) {
        // All zeros — full rejection (nothing received)
        await transfersApi.reject(
          disagreeTarget.id,
          disagreeReason.trim() || 'Ничего не получено — отклонено получателем',
        );
      } else {
        // Has some counted — send through accept which detects discrepancy
        const items = ITEM_TYPES
          .filter((t) => disagreeCounts[t] !== undefined)
          .map((t) => ({
            itemType: t,
            receivedQuantity: counts[t],
          }));
        await transfersApi.accept(disagreeTarget.id, items);
      }

      setDisagreeTarget(null);
      setDisagreeReason('');
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  // Preview what will happen based on current disagree counts
  const getDisagreePreview = () => {
    if (!disagreeTarget) return null;
    let totalCounted = 0;
    let hasDiscrepancy = false;

    ITEM_TYPES.forEach((t) => {
      if (disagreeCounts[t] !== undefined) {
        const counted = parseInt(disagreeCounts[t]) || 0;
        totalCounted += counted;
        const sent = (disagreeTarget.items || []).find((i) => i.itemType === t)?.quantity || 0;
        if (counted !== sent) hasDiscrepancy = true;
      }
    });

    if (totalCounted === 0) return { type: 'rejected', label: 'Ничего не получено — отправка будет отклонена' };
    if (hasDiscrepancy) return { type: 'discrepancy', label: 'Расхождение — количество не совпадает с отправленным' };
    return { type: 'match', label: 'Количество совпадает — лучше нажмите «Принять»' };
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

      {error && !acceptTarget && !disagreeTarget && (
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

                  {/* Bracelet types (hidden quantities for blind acceptance in card) */}
                  <div className="flex items-center gap-1.5">
                    {(t.items || []).map((item) => (
                      <BraceletBadge key={item.itemType || item.id} type={item.itemType} count="?" />
                    ))}
                    <span className="text-xs text-gray-400 ml-2">{t.items?.length || 0} цветов</span>
                  </div>

                  {t.notes && <p className="text-xs text-gray-400">{t.notes}</p>}

                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => openAccept(t)} loading={processing}>
                      <CheckCircle size={16} /> Принять
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => openDisagree(t)}
                    >
                      <XCircle size={16} /> Не согласен
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Accept Confirmation Modal ── */}
      <Modal
        open={!!acceptTarget}
        onClose={() => setAcceptTarget(null)}
        title="Подтверждение приёмки"
      >
        {acceptTarget && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <Package size={16} />
                Вам отправлены следующие браслеты:
              </p>
            </div>

            <div className="space-y-2">
              {acceptTarget.items?.map((item) => (
                <div key={item.itemType} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <BraceletBadge type={item.itemType} count={item.quantity} />
                    <span className="text-sm font-medium text-gray-700">{ITEM_LABELS[item.itemType]}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-800">{item.quantity} шт</span>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Итого:</span>
              <span className="text-lg font-bold text-gray-800">
                {(acceptTarget.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} шт
              </span>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Нажимая «Да, принимаю» вы подтверждаете, что получили все браслеты в указанном количестве.
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAcceptConfirm}
                loading={processing}
                className="flex-1"
                variant="success"
              >
                <CheckCircle size={18} /> Да, принимаю
              </Button>
              <Button
                onClick={() => setAcceptTarget(null)}
                variant="ghost"
                className="flex-shrink-0"
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Disagree / Count Modal ── */}
      <Modal
        open={!!disagreeTarget}
        onClose={() => setDisagreeTarget(null)}
        title="Не согласен с отправкой"
      >
        {disagreeTarget && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm text-orange-800 flex items-center gap-2">
                <AlertTriangle size={16} />
                Укажите сколько браслетов вы фактически насчитали.
              </p>
              <p className="text-xs text-orange-600 mt-1">
                Если ничего не получено — оставьте всё по 0.
              </p>
            </div>

            <div className="space-y-3">
              {disagreeTarget.items?.map((item) => (
                <div key={item.itemType} className="flex items-center justify-between gap-4">
                  <div className="text-sm flex items-center gap-2">
                    <BraceletBadge type={item.itemType} count="?" size="sm" />
                    <span className="font-medium">{ITEM_LABELS[item.itemType]}</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={disagreeCounts[item.itemType] ?? ''}
                    onChange={(e) =>
                      setDisagreeCounts((p) => ({ ...p, [item.itemType]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-24 text-center"
                  />
                </div>
              ))}
            </div>

            {/* Preview what will happen */}
            {(() => {
              const preview = getDisagreePreview();
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
              value={disagreeReason}
              onChange={(e) => setDisagreeReason(e.target.value)}
              placeholder="Опишите проблему..."
            />

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <Button
              onClick={handleDisagreeSubmit}
              loading={processing}
              className="w-full"
              variant={getDisagreePreview()?.type === 'match' ? 'primary' : 'danger'}
            >
              {getDisagreePreview()?.type === 'rejected' ? (
                <><XCircle size={18} /> Отклонить</>
              ) : getDisagreePreview()?.type === 'discrepancy' ? (
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
