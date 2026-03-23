/**
 * Transfer Helper Utilities
 * Provides consistent display labels for transfers across the application
 */

/**
 * Get the sender display name for a transfer
 * @param {Object} transfer - The transfer object
 * @returns {string} The sender display name
 */
export function getSenderLabel(transfer) {
  if (!transfer) return 'Неизвестно';

  // If transfer was created by a user, show their name
  if (transfer.createdByUser) {
    return transfer.createdByUser.displayName || transfer.createdByUser.username || 'Админ';
  }

  // Check senderType for specific entity types
  if (transfer.senderType === 'ADMIN' || transfer.senderType === 'OFFICE') {
    return transfer.createdByUser?.displayName || 'Админ';
  }

  // Country-level sender
  if (transfer.senderType === 'COUNTRY' && transfer.senderCountry) {
    return transfer.senderCountry.name;
  }

  // City-level sender
  if (transfer.senderType === 'CITY' && transfer.senderCity) {
    return transfer.senderCity.name;
  }

  // Fallback checks for nested objects
  if (transfer.sender?.city?.name) {
    return transfer.sender.city.name;
  }
  if (transfer.sender?.country?.name) {
    return transfer.sender.country.name;
  }
  if (transfer.sender?.displayName) {
    return transfer.sender.displayName;
  }

  return 'Отправитель';
}

/**
 * Get the receiver display name for a transfer
 * @param {Object} transfer - The transfer object
 * @returns {string} The receiver display name
 */
export function getReceiverLabel(transfer) {
  if (!transfer) return 'Неизвестно';

  // Country-level receiver
  if (transfer.receiverType === 'COUNTRY' && transfer.receiverCountry) {
    return transfer.receiverCountry.name;
  }

  // City-level receiver
  if (transfer.receiverType === 'CITY' && transfer.receiverCity) {
    return transfer.receiverCity.name;
  }

  // Fallback checks for nested objects
  if (transfer.receiver?.city?.name) {
    return transfer.receiver.city.name;
  }
  if (transfer.receiver?.country?.name) {
    return transfer.receiver.country.name;
  }
  if (transfer.receiver?.displayName) {
    return transfer.receiver.displayName;
  }

  return 'Получатель';
}

/**
 * Check if a transfer is from ADMIN or OFFICE
 * @param {Object} transfer - The transfer object
 * @returns {boolean}
 */
export function isAdminTransfer(transfer) {
  if (!transfer) return false;
  return transfer.senderType === 'ADMIN' || transfer.senderType === 'OFFICE';
}

/**
 * Get CSS classes for admin transfer highlighting
 * @param {Object} transfer - The transfer object
 * @returns {string} CSS class string
 */
export function getAdminTransferClass(transfer) {
  return isAdminTransfer(transfer) ? 'transfer-admin' : '';
}

/**
 * Get bracelet items from transfer in a consistent format
 * @param {Object} transfer - The transfer object
 * @returns {Object} { black: number, white: number, red: number, blue: number }
 */
export function getTransferItems(transfer) {
  if (!transfer) return { black: 0, white: 0, red: 0, blue: 0 };

  // If items array exists, aggregate from there
  if (transfer.items && Array.isArray(transfer.items)) {
    const result = { black: 0, white: 0, red: 0, blue: 0 };
    for (const item of transfer.items) {
      const key = item.itemType?.toLowerCase();
      if (key && result[key] !== undefined) {
        result[key] += item.quantity || item.sentQuantity || 0;
      }
    }
    return result;
  }

  // Fallback to direct properties
  return {
    black: transfer.black || transfer.blackCount || 0,
    white: transfer.white || transfer.whiteCount || 0,
    red: transfer.red || transfer.redCount || 0,
    blue: transfer.blue || transfer.blueCount || 0,
  };
}

/**
 * Format transfer status for display
 * @param {string} status - The transfer status
 * @returns {Object} { label: string, color: string, bgColor: string }
 */
export function formatTransferStatus(status) {
  const statuses = {
    SENT: { label: 'Отправлено', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    ACCEPTED: { label: 'Принято', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    DISCREPANCY_FOUND: { label: 'Расхождение', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    REJECTED: { label: 'Отклонено', color: 'text-red-500', bgColor: 'bg-red-500/10' },
    CANCELLED: { label: 'Отменено', color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
  };
  return statuses[status] || { label: status, color: 'text-gray-500', bgColor: 'bg-gray-500/10' };
}
