import { BLOCKED_SCHEDULES, DrugSchedule, type MedicineForm } from './enums.js'

/**
 * What makes a medicine a medicine.
 *
 * Deliberately its own module, not part of the platform core. The platform
 * ships orders, moves stock and settles money; it does not know what Schedule H
 * means, and it should not have to. Everything here is the pharmaceutical
 * domain's business.
 *
 * That separation is what makes a second product category a new rules module
 * rather than a rewrite: surgical supplies would bring their own
 * `ProductRules`, and orders, inventory and search would not change.
 *
 * Nothing in this file touches the database, a tenant, or a request. It is
 * decisions about medicines, which is why it can be tested without any of them.
 */

// ---------------------------------------------------------------------------
// Selling rules
// ---------------------------------------------------------------------------

/**
 * Which schedules may not be sold lives in `enums.ts` beside `DrugSchedule`
 * itself — one list, so the database trigger, the bulk import handler and this
 * module cannot drift apart. A rule that only one path checks is a rule with a
 * hole in it.
 *
 * Schedule X carries record-keeping duties — a Form 2C register, duplicate
 * prescriptions retained for two years — that MediBridge does not implement.
 * Listing one would be inviting a pharmacy to break the law using our product.
 */

/** Schedules that require a prescription on file before dispensing. */
export const PRESCRIPTION_SCHEDULES: readonly DrugSchedule[] = [
  DrugSchedule.H,
  DrugSchedule.H1,
  DrugSchedule.X,
]

export function isSellable(schedule: DrugSchedule): boolean {
  return !BLOCKED_SCHEDULES.includes(schedule)
}

/**
 * Whether this medicine needs a prescription, whatever the form says.
 *
 * The schedule decides, not the tick-box: someone entering a Schedule H drug
 * and leaving "prescription required" unticked has made a mistake, and the
 * safe reading of that mistake is the stricter one.
 */
export function requiresPrescription(
  schedule: DrugSchedule,
  declared: boolean,
): boolean {
  return declared || PRESCRIPTION_SCHEDULES.includes(schedule)
}

/** Why a schedule is blocked, in words a pharmacist would accept. */
export function blockedReason(schedule: DrugSchedule): string | null {
  if (schedule !== DrugSchedule.X) return null
  return 'Schedule X medicines need a Form 2C register and duplicate prescriptions kept for two years. MediBridge does not support that yet, so they cannot be listed here.'
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * What makes two rows the same medicine.
 *
 * Name, brand, strength and pack size. Not composition — two brands can share
 * a composition and are genuinely different products; and not manufacturer,
 * because the same pack is often made under licence by more than one.
 *
 * The database enforces the same four columns as a unique constraint, so this
 * function and that constraint must agree. `medicine-rules.spec.ts` says so.
 */
export function medicineKey(medicine: {
  name: string
  brand: string
  strength?: string | null
  packSize?: string | null
}): string {
  return [medicine.name, medicine.brand, medicine.strength ?? '', medicine.packSize ?? '']
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|')
}

/**
 * A blank optional field is absent, not empty.
 *
 * `medicineKey` above treats a missing strength and an empty one as the same
 * thing. The database's unique constraint on those four columns does not:
 * Postgres compares `''` and `NULL` as different values, so a medicine saved
 * with strength `''` sits happily beside the same medicine saved with strength
 * `NULL`. Two rows for one medicine is the precise failure this catalogue
 * exists to prevent, and an untouched input box is the easiest way to cause it.
 *
 * Anything turning typed text into a medicine goes through here: the add and
 * edit forms, the bulk import handler, and any integration after them.
 */
export function blankAsAbsent(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** The optional text on a medicine. Blank in any of these means "not given". */
export interface MedicineOptionalText {
  strength?: string | null
  packSize?: string | null
  manufacturer?: string | null
}

/** Applies {@link blankAsAbsent} to every optional field of a medicine. */
export function normaliseMedicineOptionals<T extends MedicineOptionalText>(input: T): T {
  // The spread cannot be proven to still be T by the compiler, but every key
  // it rewrites is declared optional on MedicineOptionalText, so it is.
  return {
    ...input,
    strength: blankAsAbsent(input.strength),
    packSize: blankAsAbsent(input.packSize),
    manufacturer: blankAsAbsent(input.manufacturer),
  } as T
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Everything a person compares when deciding whether two rows are one medicine. */
export const MEDICINE_COMPARISON_FIELDS = [
  'name',
  'brand',
  'composition',
  'form',
  'strength',
  'packSize',
  'manufacturer',
  'hsnCode',
  'gstRate',
  'schedule',
  'isPrescriptionRequired',
] as const

export type MedicineComparisonField = (typeof MEDICINE_COMPARISON_FIELDS)[number]

export interface ComparableMedicine extends MedicineOptionalText {
  name: string
  brand: string
  composition: string
  form: string
  hsnCode: string
  gstRate: number
  schedule: string
  isPrescriptionRequired: boolean
}

/**
 * Which fields two medicines disagree on.
 *
 * This is what a merge screen highlights, and merging is the one action in the
 * catalogue that cannot be undone — stock genuinely moves. Under-reporting a
 * difference hides the reason not to merge, so the optional fields are
 * compared through `blankAsAbsent`: a missing pack size and an empty one are
 * the same absence, and flagging them as a difference would be noise that
 * trains people to ignore the highlighting entirely.
 */
export function medicineDifferences(
  left: ComparableMedicine,
  right: ComparableMedicine,
): MedicineComparisonField[] {
  const optional = new Set<MedicineComparisonField>(['strength', 'packSize', 'manufacturer'])

  return MEDICINE_COMPARISON_FIELDS.filter((field) => {
    if (optional.has(field)) {
      return blankAsAbsent(left[field] as string | null | undefined) !==
        blankAsAbsent(right[field] as string | null | undefined)
    }
    return left[field] !== right[field]
  })
}

/**
 * How alike two medicines are, from 0 to 1.
 *
 * Used to surface *probable* duplicates — the ones an exact key misses because
 * somebody typed "Dolo-650" where the catalogue says "Dolo 650", or
 * "Paracetamol 650mg" against "Paracetamol 650 mg". A person decides; this only
 * decides what is worth showing them.
 *
 * Deliberately simple. Postgres already does the heavy lifting with `pg_trgm`
 * on the real search; this is for ranking a handful of candidates it returns.
 */
export function similarity(a: string, b: string): number {
  const left = normalise(a)
  const right = normalise(b)
  if (left === right) return 1

  const leftGrams = trigrams(left)
  const rightGrams = trigrams(right)
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0

  let shared = 0
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1

  // Jaccard: shared over the union, so a long name is not automatically
  // similar to every short one it happens to contain.
  return shared / (leftGrams.size + rightGrams.size - shared)
}

/** Above this, two medicines are worth showing a human side by side. */
export const DUPLICATE_THRESHOLD = 0.55

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `
  const grams = new Set<string>()
  for (let i = 0; i < padded.length - 2; i += 1) grams.add(padded.slice(i, i + 3))
  return grams
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** How a medicine reads on a shelf label: "Dolo 650 · Tablet · 15 tablets". */
export function describeMedicine(medicine: {
  name: string
  form: MedicineForm
  strength?: string | null
  packSize?: string | null
}): string {
  return [medicine.name, medicine.strength, FORM_LABELS[medicine.form], medicine.packSize]
    .filter(Boolean)
    .join(' · ')
}

export const FORM_LABELS: Record<MedicineForm, string> = {
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SYRUP: 'Syrup',
  INJECTION: 'Injection',
  OINTMENT: 'Ointment',
  CREAM: 'Cream',
  DROPS: 'Drops',
  POWDER: 'Powder',
  INHALER: 'Inhaler',
  SPRAY: 'Spray',
  GEL: 'Gel',
  SACHET: 'Sachet',
  OTHER: 'Other',
}

export const SCHEDULE_LABELS: Record<DrugSchedule, string> = {
  NONE: 'No schedule — sold over the counter',
  H: 'Schedule H — prescription required',
  H1: 'Schedule H1 — prescription required, sale recorded',
  X: 'Schedule X — cannot be sold on MediBridge',
}
