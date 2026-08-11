import { DrugSchedule, MedicineForm } from '@medibridge/types'
import {
  type ComparableMedicine,
  DUPLICATE_THRESHOLD,
  blankAsAbsent,
  describeMedicine,
  isSellable,
  medicineDifferences,
  medicineKey,
  normaliseMedicineOptionals,
  requiresPrescription,
  similarity,
} from '@medibridge/types'

/**
 * The medicine domain's own rules.
 *
 * These are the compliance gates and the identity rule — the two things on
 * MODULE-STANDARD's "test this" list that apply to a catalogue. Getting the
 * first wrong puts a Schedule X drug on sale; getting the second wrong splits
 * one medicine across two rows so neither shows the real best price.
 *
 * No database, no tenant, no request: they are decisions about medicines.
 */
describe('what may be sold', () => {
  it('blocks Schedule X and nothing else', () => {
    expect(isSellable(DrugSchedule.X)).toBe(false)
    expect(isSellable(DrugSchedule.NONE)).toBe(true)
    expect(isSellable(DrugSchedule.H)).toBe(true)
    expect(isSellable(DrugSchedule.H1)).toBe(true)
  })
})

describe('prescriptions', () => {
  it('forces a prescription for scheduled drugs even when unticked', () => {
    // Someone entering a Schedule H drug and leaving the box unticked has made
    // a mistake. The safe reading of that mistake is the stricter one.
    expect(requiresPrescription(DrugSchedule.H, false)).toBe(true)
    expect(requiresPrescription(DrugSchedule.H1, false)).toBe(true)
  })

  it('respects a tick on an unscheduled medicine', () => {
    expect(requiresPrescription(DrugSchedule.NONE, true)).toBe(true)
    expect(requiresPrescription(DrugSchedule.NONE, false)).toBe(false)
  })
})

describe('what makes two rows the same medicine', () => {
  const base = { name: 'Dolo 650', brand: 'Micro Labs', strength: '650mg', packSize: '15 tablets' }

  it('ignores case and stray spacing', () => {
    expect(medicineKey(base)).toBe(
      medicineKey({ ...base, name: '  DOLO   650 ', brand: 'micro labs' }),
    )
  })

  it('separates different pack sizes', () => {
    // Same tablet, different product: a 10-pack and a 15-pack have different
    // prices and different stock.
    expect(medicineKey(base)).not.toBe(medicineKey({ ...base, packSize: '10 tablets' }))
  })

  it('separates different brands on the same composition', () => {
    expect(medicineKey(base)).not.toBe(medicineKey({ ...base, brand: 'Cipla' }))
  })

  it('treats a missing strength as empty, not as a wildcard', () => {
    expect(medicineKey({ name: 'X', brand: 'Y' })).toBe(
      medicineKey({ name: 'X', brand: 'Y', strength: null, packSize: null }),
    )
  })
})

describe('probable duplicates', () => {
  it('scores the near-misses an exact key cannot catch', () => {
    // These pass every unique constraint and then split one medicine in two.
    expect(similarity('Dolo 650', 'Dolo-650')).toBeGreaterThan(DUPLICATE_THRESHOLD)
    expect(similarity('Paracetamol 650 mg', 'Paracetamol 650mg')).toBeGreaterThan(
      DUPLICATE_THRESHOLD,
    )
  })

  it('does not flag genuinely different medicines', () => {
    expect(similarity('Dolo 650', 'Azithral 500')).toBeLessThan(DUPLICATE_THRESHOLD)
    expect(similarity('Crocin Advance', 'Combiflam')).toBeLessThan(DUPLICATE_THRESHOLD)
  })

  it('does not call a short name similar to every longer one containing it', () => {
    // Jaccard over the union rather than over the shorter string, or "Zin"
    // would match everything with "zin" anywhere in it.
    expect(similarity('Zinc', 'Zincovit Multivitamin Syrup 200ml')).toBeLessThan(
      DUPLICATE_THRESHOLD,
    )
  })

  it('is symmetric', () => {
    expect(similarity('Dolo 650', 'Dolo-650')).toBeCloseTo(similarity('Dolo-650', 'Dolo 650'))
  })
})

describe('blank optional fields', () => {
  it('treats empty and whitespace-only text as absent', () => {
    expect(blankAsAbsent('')).toBeUndefined()
    expect(blankAsAbsent('   ')).toBeUndefined()
    expect(blankAsAbsent(null)).toBeUndefined()
    expect(blankAsAbsent(undefined)).toBeUndefined()
  })

  it('trims what it keeps', () => {
    expect(blankAsAbsent('  650mg ')).toBe('650mg')
  })

  it('keeps the identity key and the unique constraint agreeing', () => {
    // The whole point. medicineKey() reads '' and null as the same medicine;
    // Postgres reads them as two different rows. Normalising first is what
    // stops an untouched input box creating a second copy of one medicine.
    const typed = normaliseMedicineOptionals({
      name: 'Dolo 650',
      brand: 'Micro Labs',
      strength: '',
      packSize: '   ',
      manufacturer: '',
    })

    expect(typed.strength).toBeUndefined()
    expect(typed.packSize).toBeUndefined()
    expect(typed.manufacturer).toBeUndefined()
    expect(medicineKey(typed)).toBe(
      medicineKey({ name: 'Dolo 650', brand: 'Micro Labs', strength: null, packSize: null }),
    )
  })

  it('leaves the fields that are not optional text alone', () => {
    const input = { name: ' Dolo 650 ', brand: 'Micro Labs', strength: '650mg' }
    expect(normaliseMedicineOptionals(input).name).toBe(' Dolo 650 ')
  })
})

describe('comparing two medicines before a merge', () => {
  const base: ComparableMedicine = {
    name: 'Dolo 650',
    brand: 'Micro Labs',
    composition: 'Paracetamol 650mg',
    form: MedicineForm.TABLET,
    strength: '650mg',
    packSize: '15 tablets',
    manufacturer: 'Micro Labs Ltd',
    hsnCode: '30049099',
    gstRate: 12,
    schedule: DrugSchedule.NONE,
    isPrescriptionRequired: false,
  }

  it('finds nothing to report when two rows are identical', () => {
    expect(medicineDifferences(base, { ...base })).toEqual([])
  })

  it('reports every field that genuinely differs', () => {
    const other = { ...base, name: 'Dolo-650', gstRate: 5, schedule: DrugSchedule.H }
    expect(medicineDifferences(base, other).sort()).toEqual(['gstRate', 'name', 'schedule'])
  })

  it('does not call a missing optional field a difference against an empty one', () => {
    // Noise here is not harmless: highlighting a non-difference on a screen
    // that cannot be undone teaches people to ignore the highlighting.
    const left = { ...base, packSize: null, manufacturer: '' }
    const right = { ...base, packSize: '', manufacturer: undefined }
    expect(medicineDifferences(left, right)).toEqual([])
  })

  it('still reports an optional field that has two real values', () => {
    expect(medicineDifferences(base, { ...base, packSize: '10 tablets' })).toEqual(['packSize'])
  })

  it('is symmetric, so swapping which row is kept changes nothing', () => {
    const other = { ...base, brand: 'Cipla', isPrescriptionRequired: true }
    expect(medicineDifferences(base, other)).toEqual(medicineDifferences(other, base))
  })
})

describe('how a medicine reads', () => {
  it('skips the parts that are missing', () => {
    expect(
      describeMedicine({ name: 'Dolo 650', form: MedicineForm.TABLET, strength: '650mg', packSize: '15 tablets' }),
    ).toBe('Dolo 650 · 650mg · Tablet · 15 tablets')

    expect(describeMedicine({ name: 'Betadine', form: MedicineForm.OINTMENT })).toBe(
      'Betadine · Ointment',
    )
  })
})
