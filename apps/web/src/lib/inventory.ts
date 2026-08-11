import type {
  ExpiryStatus,
  InventoryItemInput,
  InventoryItemUpdateInput,
  Paginated,
  StockLevel,
} from '@medibridge/types'
import { api } from './api-client'

/**
 * The browser's view of a distributor's own stock.
 *
 * Every path here is tenant-scoped by Row-Level Security on the server, so
 * nothing in this file sends a company id — there is no parameter for one, and
 * one would not be trusted if there were.
 */

export interface InventoryItem {
  id: string
  medicineId: string
  medicineName: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  schedule: string
  isPrescriptionRequired: boolean

  warehouseId: string
  warehouseName: string

  batchNumber: string
  expiryDate: string
  daysUntilExpiry: number
  expiryStatus: ExpiryStatus

  mrpPaise: number
  sellingPricePaise: number
  discountPercent: number

  quantity: number
  reservedQuantity: number
  availableQuantity: number
  unit: string
  minOrderQuantity: number
  lowStockThreshold: number
  stockLevel: StockLevel

  isActive: boolean
  isSellable: boolean

  createdAt: string
  updatedAt: string
}

export interface InventorySummary {
  totalBatches: number
  lowStock: number
  outOfStock: number
  expiringSoon: number
  expired: number
  stockValuePaise: number
}

export interface Warehouse {
  id: string
  name: string
  isAcceptingOrders: boolean
}

export interface InventoryFilters {
  search: string
  warehouseId: string
  stock: 'all' | 'low' | 'out'
  expiry: 'all' | 'expiring' | 'expired'
  status: 'active' | 'inactive' | 'all'
  sortBy: 'expiry' | 'name' | 'stock' | 'updated'
  page: number
  pageSize: number
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  search: '',
  warehouseId: '',
  stock: 'all',
  expiry: 'all',
  // The working view is what can actually be sold. Switched-off batches are
  // history and are asked for explicitly.
  status: 'active',
  // Soonest expiry first: what dies next matters more than what arrived last.
  sortBy: 'expiry',
  page: 1,
  pageSize: 25,
}

export function activeInventoryFilterCount(filters: InventoryFilters): number {
  let count = 0
  if (filters.search.trim()) count += 1
  if (filters.warehouseId) count += 1
  if (filters.stock !== DEFAULT_INVENTORY_FILTERS.stock) count += 1
  if (filters.expiry !== DEFAULT_INVENTORY_FILTERS.expiry) count += 1
  if (filters.status !== DEFAULT_INVENTORY_FILTERS.status) count += 1
  return count
}

function listPath(filters: InventoryFilters): string {
  const params = new URLSearchParams()
  if (filters.search.trim()) params.set('search', filters.search.trim())
  if (filters.warehouseId) params.set('warehouseId', filters.warehouseId)
  params.set('stock', filters.stock)
  params.set('expiry', filters.expiry)
  params.set('status', filters.status)
  params.set('sortBy', filters.sortBy)
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))
  return `/inventory?${params.toString()}`
}

/** Nested so one invalidate clears the list, the item and the summary tiles. */
export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (filters: InventoryFilters) => ['inventory', 'list', filters] as const,
  detail: (id: string) => ['inventory', 'detail', id] as const,
  summary: ['inventory', 'summary'] as const,
  warehouses: ['inventory', 'warehouses'] as const,
}

export const inventoryApi = {
  list: (filters: InventoryFilters) => api.get<Paginated<InventoryItem>>(listPath(filters)),
  get: (id: string) => api.get<InventoryItem>(`/inventory/${id}`),
  summary: () => api.get<InventorySummary>('/inventory/summary'),
  create: (input: InventoryItemInput) => api.post<InventoryItem>('/inventory', input),
  update: (id: string, input: InventoryItemUpdateInput) =>
    api.patch<InventoryItem>(`/inventory/${id}`, input),
  remove: (id: string) => api.delete<{ removed: true }>(`/inventory/${id}`),
  warehouses: () => api.get<Warehouse[]>('/company/warehouses'),
}
