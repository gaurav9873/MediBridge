'use client'

import { copy } from '@medibridge/copy'
import {
  FORM_LABELS,
  MedicineForm as MedicineFormEnum,
  type MedicineForm as MedicineFormValue,
  formatPaise,
} from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CheckboxField,
  DataView,
  PageShell,
  SelectField,
  StatusBadge,
  TextField,
  cn,
} from '@medibridge/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronDown, Search, Truck, Zap } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

const c = copy.catalog.search

interface Offer {
  warehouseId: string
  sellerId: string
  sellerName: string
  pricePaise: number
  mrpPaise: number
  available: number
  minOrderQuantity: number
  expiresOn: string
  distanceKm: number
  sameDayAvailable: boolean
}

interface ResultMedicine {
  medicineId: string
  name: string
  brand: string
  composition: string
  form: string
  bestPricePaise: number
  mrpPaise: number
  sellerCount: number
  sameDayAvailable: boolean
  offers: Offer[]
}

interface SearchResult {
  items: ResultMedicine[]
  sellersInRange: number
  tookMs: number
  cached: boolean
}

const formOptions = [
  { value: '', label: c.filters.form.label },
  ...Object.values(MedicineFormEnum).map((value) => ({ value, label: FORM_LABELS[value] })),
]

const sortOptions = [
  { value: 'relevance', label: c.filters.sortOptions.relevance },
  { value: 'priceLow', label: c.filters.sortOptions.priceLow },
  { value: 'priceHigh', label: c.filters.sortOptions.priceHigh },
  { value: 'fastest', label: c.filters.sortOptions.fastest },
  { value: 'expiryLongest', label: c.filters.sortOptions.expiryLongest },
]

/**
 * One medicine, and every distributor near this shop who has it.
 *
 * The offers are the product. A retailer's real question is not "does anyone
 * have Dolo" but "who near me has it, at what price, and how fast" — so the
 * card leads with the best price and the number of sellers, and opens into the
 * comparison rather than hiding it behind a second screen.
 */
function MedicineCard({ medicine }: { medicine: ResultMedicine }): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const saving = medicine.mrpPaise - medicine.bestPricePaise
  const savingPercent =
    medicine.mrpPaise > 0 ? Math.round((saving / medicine.mrpPaise) * 100) : 0

  // Cheapest first: the reason to compare at all.
  const offers = [...medicine.offers].sort((a, b) => a.pricePaise - b.pricePaise)

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold text-content-primary">{medicine.name}</span>
            <span className="text-sm text-content-secondary">
              {medicine.brand} · {FORM_LABELS[medicine.form as MedicineFormValue] ?? medicine.form}
            </span>
            <span className="text-sm text-content-muted">{medicine.composition}</span>
          </div>

          <div className="flex flex-col items-end gap-0.5">
            <span className="text-lg font-semibold text-content-primary">
              {formatPaise(medicine.bestPricePaise)}
            </span>
            <span className="text-xs text-content-muted line-through">
              {formatPaise(medicine.mrpPaise)}
            </span>
            {savingPercent > 0 && (
              <span className="text-xs font-medium text-success-700">
                {c.savingsNote(savingPercent)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {medicine.sameDayAvailable && (
            <StatusBadge label={c.sameDayTag} tone="success" icon={<Zap />} />
          )}
          <span className="text-sm text-content-secondary">
            {c.offersHeading(medicine.sellerCount)}
          </span>
          <Button variant="link" className="ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? c.hideOffers : c.showOffers}
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </Button>
        </div>

        {open && (
          <ul className="flex flex-col divide-y divide-border-default rounded-(--radius-md) border border-border-default">
            {offers.map((offer, index) => (
              <li
                key={`${offer.sellerId}-${offer.warehouseId}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-content-primary">
                    {offer.sellerName}
                    {index === 0 && offers.length > 1 && (
                      <StatusBadge label={c.bestPrice} tone="success" />
                    )}
                  </span>
                  <span className="text-sm text-content-secondary">
                    {c.distanceAway(Math.round(offer.distanceKm * 10) / 10)} ·{' '}
                    {c.availableUnits(offer.available)}
                  </span>
                  <span className="text-sm text-content-muted">
                    {c.expiresOn(offer.expiresOn)} · {c.minOrderNote(offer.minOrderQuantity, 'units')}
                  </span>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums text-content-primary">
                    {formatPaise(offer.pricePaise)}
                  </span>
                  <StatusBadge
                    label={offer.sameDayAvailable ? c.sameDayTag : c.nextDayTag}
                    tone={offer.sameDayAvailable ? 'success' : 'neutral'}
                    icon={offer.sameDayAvailable ? <Zap /> : <Truck />}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * The retailer's search.
 *
 * Reads the offer projection, which is maintained by a database trigger and
 * already excludes anything expired, inactive or out of stock — so a result
 * here is genuinely buyable, not a listing that fails at checkout.
 */
export default function SearchPage(): React.JSX.Element {
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [form, setForm] = React.useState('')
  const [sortBy, setSortBy] = React.useState('relevance')
  const [sameDayOnly, setSameDayOnly] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(timer)
  }, [term])

  const params = new URLSearchParams()
  if (debounced.trim()) params.set('query', debounced.trim())
  if (form) params.set('form', form)
  if (sameDayOnly) params.set('sameDayOnly', 'true')
  params.set('sortBy', sortBy)

  const hasQuery = debounced.trim().length > 0

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['search', params.toString()],
    queryFn: () => api.get<SearchResult>(`/search/medicines?${params.toString()}`),
    enabled: hasQuery,
    placeholderData: keepPreviousData,
  })

  const clearFilters = (): void => {
    setForm('')
    setSameDayOnly(false)
    setSortBy('relevance')
  }

  return (
    <PageShell
      page={c.page}
      help={c.help}
      toolbar={
        <div className="flex flex-col gap-3">
          <TextField
            field={c.fields.query}
            type="search"
            value={term}
            leading={<Search className="size-4" aria-hidden />}
            onChange={(event) => setTerm(event.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              field={c.filters.form}
              options={formOptions}
              value={form}
              onChange={(event) => setForm(event.target.value)}
            />
            <SelectField
              field={c.filters.sortBy}
              options={sortOptions}
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            />
            <CheckboxField
              field={c.filters.deliveryMode}
              checked={sameDayOnly}
              onChange={(event) => setSameDayOnly(event.target.checked)}
            />
          </div>
        </div>
      }
    >
      {/* Buying arrives in the next phase. Saying so beats a dead button. */}
      <Alert tone="info" title={c.cartComingSoon} />

      {data && (
        <p className="text-sm text-content-secondary">
          {c.sellersNearYou(data.sellersInRange)} · {c.resultCount(data.items.length)}
        </p>
      )}

      <DataView
        data={hasQuery ? data?.items : undefined}
        isLoading={hasQuery && isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={hasQuery ? c.noResults : c.empty}
        emptyIcon={<Search />}
        isFiltered={hasQuery}
        onClearFilters={clearFilters}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <div aria-busy={isFetching} className="flex flex-col gap-3">
            {items.map((medicine) => (
              <MedicineCard key={medicine.medicineId} medicine={medicine} />
            ))}
          </div>
        )}
      </DataView>
    </PageShell>
  )
}
