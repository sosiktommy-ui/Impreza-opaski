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

/**
 * Get quantity for a specific color from transfer
 * @param {Object} transfer - The transfer object
 * @param {string} color - The color (black, white, red, blue)
 * @returns {number}
 */
export function getQuantity(transfer, color) {
  if (!transfer) return 0;
  const upperColor = color.toUpperCase();
  const lowerColor = color.toLowerCase();
  
  if (transfer.items && Array.isArray(transfer.items)) {
    const item = transfer.items.find(i => 
      i.itemType === upperColor || 
      i.itemType === lowerColor || 
      i.type === upperColor || 
      i.type === lowerColor ||
      i.color === upperColor ||
      i.color === lowerColor
    );
    return item?.quantity ?? item?.sentQuantity ?? 0;
  }
  if (transfer[upperColor] !== undefined) return transfer[upperColor];
  if (transfer[lowerColor] !== undefined) return transfer[lowerColor];
  return 0;
}

/**
 * Get total quantity of all bracelets in transfer
 * @param {Object} transfer - The transfer object
 * @returns {number}
 */
export function getTotalQuantity(transfer) {
  if (!transfer) return 0;
  return ['BLACK', 'WHITE', 'RED', 'BLUE'].reduce((sum, c) => sum + getQuantity(transfer, c), 0);
}

/**
 * Get sender name for display (with role fallback)
 * @param {Object} transfer - The transfer object
 * @returns {string}
 */
export function getSenderName(transfer) {
  if (!transfer) return 'Неизвестно';
  
  // First try createdByUser for ADMIN/OFFICE
  if (transfer.senderType === 'ADMIN' || transfer.senderType === 'OFFICE') {
    if (transfer.createdByUser?.displayName) return transfer.createdByUser.displayName;
    if (transfer.createdByUser?.username) return transfer.createdByUser.username;
    return transfer.senderType === 'ADMIN' ? 'Админ' : 'Офис';
  }
  
  // City sender
  if (transfer.senderType === 'CITY' && transfer.senderCity) {
    const country = transfer.senderCity.country?.name;
    return country ? `${transfer.senderCity.name} (${country})` : transfer.senderCity.name;
  }
  
  // Country sender  
  if (transfer.senderType === 'COUNTRY' && transfer.senderCountry) {
    return transfer.senderCountry.name;
  }
  
  // Fallbacks
  return transfer.senderName || 
         transfer.sender?.displayName || 
         transfer.sender?.name ||
         transfer.sender?.username || 
         'Неизвестно';
}

/**
 * Get receiver name for display
 * @param {Object} transfer - The transfer object  
 * @returns {string}
 */
export function getReceiverName(transfer) {
  if (!transfer) return 'Неизвестно';
  
  if (transfer.receiverType === 'ADMIN') return 'Админ';
  if (transfer.receiverType === 'OFFICE' && transfer.receiverOffice) {
    return transfer.receiverOffice.name;
  }
  
  // City receiver
  if (transfer.receiverType === 'CITY' && transfer.receiverCity) {
    const country = transfer.receiverCity.country?.name;
    return country ? `${transfer.receiverCity.name} (${country})` : transfer.receiverCity.name;
  }
  
  // Country receiver
  if (transfer.receiverType === 'COUNTRY' && transfer.receiverCountry) {
    return transfer.receiverCountry.name;
  }
  
  return transfer.receiverName || 
         transfer.receiver?.name || 
         transfer.receiverCountry?.name || 
         'Неизвестно';
}

/**
 * Get sender role label in Russian
 * @param {Object} transfer - The transfer object
 * @returns {string}
 */
export function getSenderRoleLabel(transfer) {
  if (!transfer) return '';
  const role = transfer.senderType || transfer.createdByUser?.role || '';
  const labels = {
    ADMIN: 'ADMIN',
    OFFICE: 'OFFICE',
    COUNTRY: 'COUNTRY',
    CITY: 'CITY',
  };
  return labels[role] || role;
}

/**
 * Get card CSS classes for admin transfer
 * @param {Object} transfer - The transfer object
 * @returns {string}
 */
export function getTransferCardClass(transfer) {
  if (isAdminTransfer(transfer)) {
    return 'border-l-[3px] border-l-violet-500 bg-violet-500/5';
  }
  return '';
}
