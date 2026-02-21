import { useState, useEffect } from 'react';
import { transfersApi } from '../api/transfers';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { BraceletRow } from '../components/ui/BraceletBadge';
import { CheckCircle, XCircle } from 'lucide-react';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Acceptance() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [receivedQty, setReceivedQty] = useState({});
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    try {
      const { data } = await transfersApi.getPending();
      setPending(data.data || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAccept = (transfer) => {
    setSelected(transfer);
    setShowReject(false);
    setError('');
    // Pre-fill with sent quantities
    const qty = {};
    transfer.items?.forEach((item) => {
      qty[item.itemType] = String(item.quantity);
    });
    setReceivedQty(qty);
  };

  const handleAccept = async () => {
    setProcessing(true);
    setError('');
    try {
      const items = ITEM_TYPES
        .filter((t) => receivedQty[t] !== undefined)
        .map((t) => ({
          itemType: t,
          receivedQuantity: parseInt(receivedQty[t]) || 0,
        }));

      await transfersApi.accept(selected.id, items);
      setSelected(null);
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка приёмки');
    } finally {
      setProcessing(false);
    }
  };

  const openReject = (transfer) => {
    setSelected(transfer);
    setShowReject(true);
    setRejectReason('');
    setError('');
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Укажите причину отклонения');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      await transfersApi.reject(selected.id, rejectReason);
      setSelected(null);
      setShowReject(false);
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка отклонения');
    } finally {
      setProcessing(false);
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
      <h2 className="text-xl font-bold text-gray-800">Приёмка</h2>

      {pending.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет входящих отправок</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => (
            <Card key={t.id}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      От: {t.sender?.displayName || 'Админ'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(t.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <Badge status={t.status} />
                </div>

                <div className="text-sm text-gray-600">Отправлено:</div>
                <BraceletRow items={t.items} size="sm" />

                {t.notes && <p className="text-xs text-gray-400">{t.notes}</p>}

                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => openAccept(t)}>
                    <CheckCircle size={16} /> Принять
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => openReject(t)}>
                    <XCircle size={16} /> Отклонить
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Accept modal */}
      <Modal
        open={!!selected && !showReject}
        onClose={() => setSelected(null)}
        title="Приёмка браслетов"
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Укажите фактически полученное количество:
            </p>

            <div className="space-y-3">
              {selected.items?.map((item) => (
                <div key={item.itemType} className="flex items-center justify-between gap-4">
                  <div className="text-sm">
                    <span className="font-medium">{ITEM_LABELS[item.itemType]}</span>
                    <span className="text-gray-400 ml-2">(отпр: {item.quantity})</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={receivedQty[item.itemType] || ''}
                    onChange={(e) =>
                      setReceivedQty((p) => ({ ...p, [item.itemType]: e.target.value }))
                    }
                    className="w-24 text-center"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <Button onClick={handleAccept} loading={processing} className="w-full" variant="success">
              <CheckCircle size={18} /> Подтвердить приёмку
            </Button>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal
        open={!!selected && showReject}
        onClose={() => { setSelected(null); setShowReject(false); }}
        title="Отклонить отправку"
      >
        <div className="space-y-4">
          <Input
            label="Причина отклонения"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Укажите причину..."
          />

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button onClick={handleReject} loading={processing} className="w-full" variant="danger">
            <XCircle size={18} /> Отклонить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
