import type { MedicineInput, Paginated } from '@medibridge/types'
import { api } from './api-client'

/**
 * The browser's view of the medicine catalogue API.
 *
 * One module for every `/medicines` call so the six screens share the same
 * paths, the same row shapes and — importantly — the same React Query keys.
 * When a merge archives a medicine, `medicineKeys.all` invalidates the list,
 * the duplicate review and the request queue in one line, and no screen is
 * left showing a row that no longer exists.
 *
 * The shapes below mirror what MedicineService returns. They are declared here
 * rather than shared from @medibridge/types on purpose: these are transport
 * DTOs of one controller, not domain rules, and the rules that ARE shared —
 * `medicineKey`, `isSellable`, `medicineSchema` — already live in that package
 * and are imported by both sides.
 */

/** One row of the catalogue, as `GET /medicines` returns it. */
export interface MedicineSummary {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  manufacturer: string | null
  hsnCode: string
  gstRate: number
  schedule: string
  isPrescriptionRequired: boolean
  isActive: boolean
  /** Live batches across every seller. Drives the archive warning. */
  stockItems: number
  createdAt: string
  updatedAt: string
}

/** A medicine that might be the same as the one being reviewed. */
export interface DuplicateCandidate {
  medicine: MedicineSummary
  /** 0–1. Rendered as a percentage. */
  score: number
  /** Name, brand, strength and pack size all match exactly. */
  exact: boolean
}

export interface MedicineRequestSummary {
  id: string
  name: string
  brand: string
  composition: string | null
  form: string | null
  strength: string | null
  notes: string | null
  status: string
  rejectionReason: string | null
  requestedBy: string
  requestedByCompany: string | null
  medicineId: string | null
  createdAt: string
}

/** What the request endpoint answers when the medicine is already listed. */
export interface RequestAlreadyExists {
  alreadyExists: true
  medicineId: string
  name: string
}

export type MedicineRequestResult = MedicineRequestSummary | RequestAlreadyExists

export function isAlreadyExists(result: MedicineRequestResult): result is RequestAlreadyExists {
  return 'alreadyExists' in result
}

export interface MedicineListFilters {
  search: string
  form: string
  schedule: string
  status: 'active' | 'archived' | 'all'
  page: number
  pageSize: number
}

export const DEFAULT_MEDICINE_FILTERS: MedicineListFilters = {
  search: '',
  form: '',
  schedule: '',
  // The catalogue's working view is what distributors can actually stock.
  // Archived rows are history, and are asked for explicitly.
  status: 'active',
  page: 1,
  pageSize: 25,
}

/** How many of the filters are doing something — drives the "clear" affordance. */
export function activeFilterCount(filters: MedicineListFilters): number {
  let count = 0
  if (filters.search.trim()) count += 1
  if (filters.form) count += 1
  if (filters.schedule) count += 1
  if (filters.status !== DEFAULT_MEDICINE_FILTERS.status) count += 1
  return count
}

function listPath(filters: MedicineListFilters): string {
  const params = new URLSearchParams()
  if (filters.search.trim()) params.set('search', filters.search.trim())
  if (filters.form) params.set('form', filters.form)
  if (filters.schedule) params.set('schedule', filters.schedule)
  params.set('status', filters.status)
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))
  return `/medicines?${params.toString()}`
}

/**
 * Query keys.
 *
 * Nested so that invalidating `medicineKeys.all` clears every medicine screen
 * at once — which is what a merge or an archive actually needs.
 */
export const medicineKeys = {
  all: ['medicines'] as const,
  list: (filters: MedicineListFilters) => ['medicines', 'list', filters] as const,
  detail: (id: string) => ['medicines', 'detail', id] as const,
  duplicates: (id: string) => ['medicines', 'duplicates', id] as const,
  pendingRequests: ['medicines', 'requests', 'pending'] as const,
  myRequests: ['medicines', 'requests', 'mine'] as const,
}

export const medicinesApi = {
  list: (filters: MedicineListFilters) => api.get<Paginated<MedicineSummary>>(listPath(filters)),

  get: (id: string) => api.get<MedicineSummary>(`/medicines/${id}`),

  duplicates: (id: string) => api.get<DuplicateCandidate[]>(`/medicines/${id}/duplicates`),

  create: (input: MedicineInput) => api.post<MedicineSummary>('/medicines', input),

  update: (id: string, input: MedicineInput) =>
    api.patch<MedicineSummary>(`/medicines/${id}`, input),

  archive: (id: string) => api.post<MedicineSummary>(`/medicines/${id}/archive`, {}),

  restore: (id: string) => api.post<MedicineSummary>(`/medicines/${id}/restore`, {}),

  merge: (input: { keepId: string; mergeId: string }) =>
    api.post<{ moved: number; collided: number }>('/medicines/merge', input),

  pendingRequests: () => api.get<MedicineRequestSummary[]>('/medicines/requests/pending'),

  myRequests: () => api.get<MedicineRequestSummary[]>('/medicines/requests/mine'),

  request: (input: {
    name: string
    brand: string
    composition?: string
    form?: string
    strength?: string
    notes?: string
  }) => api.post<MedicineRequestResult>('/medicines/requests', input),

  approveRequest: (id: string, medicine: MedicineInput) =>
    api.post<{ medicineId: string }>(`/medicines/requests/${id}/approve`, medicine),

  rejectRequest: (id: string, reason: string) =>
    api.post<{ rejected: true }>(`/medicines/requests/${id}/reject`, { reason }),
}
