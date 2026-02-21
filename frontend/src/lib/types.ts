// ──────────────────── Shared Types ────────────────────

export type Role = 'ADMIN' | 'COUNTRY' | 'CITY';
export type ItemType = 'BLACK' | 'WHITE' | 'RED' | 'BLUE';
export type TransferStatus =
  | 'DRAFT'
  | 'SENT'
  | 'AWAITING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DISCREPANCY_FOUND'
  | 'REJECTED'
  | 'CANCELLED';
export type CityStatus = 'ACTIVE' | 'LOW' | 'INACTIVE';
export type EntityType = 'ADMIN' | 'COUNTRY' | 'CITY';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  countryId?: string;
  cityId?: string;
  isActive: boolean;
  createdAt: string;
  country?: Country;
  city?: City;
}

export interface Country {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  cities?: City[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
  countryId: string;
  status: CityStatus;
  latitude: number;
  longitude: number;
  country?: Country;
}

export interface InventoryBalance {
  id: string;
  entityType: EntityType;
  entityId: string;
  itemType: ItemType;
  quantity: number;
}

export interface Transfer {
  id: string;
  senderType: EntityType;
  senderCountryId?: string;
  senderCityId?: string;
  receiverType: EntityType;
  receiverCountryId?: string;
  receiverCityId?: string;
  status: TransferStatus;
  notes?: string;
  version: number;
  items: TransferItem[];
  acceptanceRecords?: AcceptanceRecord[];
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  acceptedAt?: string;
  createdBy: string;
  senderCountry?: Country;
  senderCity?: City;
  receiverCountry?: Country;
  receiverCity?: City;
  rejection?: TransferRejection;
}

export interface TransferItem {
  id: string;
  transferId: string;
  itemType: ItemType;
  quantity?: number; // may be hidden for blind acceptance
}

export interface AcceptanceRecord {
  id: string;
  transferId: string;
  itemType: ItemType;
  sentQuantity: number;
  receivedQuantity: number;
  discrepancy: number;
  acceptedById: string;
  createdAt: string;
}

export interface TransferRejection {
  id: string;
  transferId: string;
  reason: string;
  rejectedBy: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  actor?: User;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
    unreadCount?: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}
