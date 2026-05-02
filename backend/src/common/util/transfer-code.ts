/**
 * Generates a short transfer code: TR-XXXXXX (6 random alphanumeric uppercase chars).
 */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars

export function generateTransferCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  return `TR-${s}`;
}
