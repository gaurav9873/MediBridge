import type { Readable } from 'node:stream'
import { type ColumnSpec, ERROR_COLUMN_HEADER } from '@medibridge/types'
import ExcelJS from 'exceljs'
import { parse as parseCsv } from 'fast-csv'

/**
 * Streams a spreadsheet row by row.
 *
 * Streaming rather than loading is the whole point: a 50,000-row file must not
 * put 50,000 objects in memory at once. Both readers yield one row at a time,
 * so peak memory is a single batch regardless of file size.
 *
 * `xlsx` (SheetJS) is deliberately not used — it has carried security
 * advisories and no longer publishes its community build to npm. ExcelJS has a
 * true streaming reader.
 */

export interface RawRow {
  /** 1-based row number as the user sees it in their spreadsheet. */
  rowNumber: number
  /** Values keyed by ColumnSpec.key, already trimmed. */
  values: Record<string, string>
}

export interface HeaderResult {
  /** Column keys found, in file order. */
  present: string[]
  /** Required columns the file is missing — a whole-file rejection. */
  missing: string[]
}

/** Header matching is forgiving: case, spacing and punctuation are ignored. */
function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function mapHeaders(
  headers: string[],
  columns: ColumnSpec[],
): {
  keyByIndex: Map<number, string>
  result: HeaderResult
} {
  const specByNormalized = new Map(columns.map((c) => [normalizeHeader(c.header), c]))
  const keyByIndex = new Map<number, string>()
  const present: string[] = []

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header ?? '')
    // The Error column exists in downloaded error files. Ignoring it is what
    // makes a corrected error file re-importable with no editing.
    if (normalized === normalizeHeader(ERROR_COLUMN_HEADER)) return

    const spec = specByNormalized.get(normalized)
    if (spec) {
      keyByIndex.set(index, spec.key)
      present.push(spec.key)
    }
  })

  const missing = columns
    .filter((column) => column.required && !present.includes(column.key))
    .map((column) => column.header)

  return { keyByIndex, result: { present, missing } }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    // ExcelJS returns objects for formulas, rich text and hyperlinks.
    const record = value as Record<string, unknown>
    if ('result' in record) return cellToString(record.result)
    if ('text' in record) return String(record.text)
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text: string }).text)).join('')
    }
    return ''
  }
  return String(value).trim()
}

export interface RowReader {
  headers: HeaderResult
  rows: AsyncIterable<RawRow>
}

/** Detects the format from the file name and returns the matching reader. */
export async function openRowReader(
  stream: Readable,
  fileName: string,
  columns: ColumnSpec[],
): Promise<RowReader> {
  const isCsv = /\.csv$/i.test(fileName)
  return isCsv ? openCsvReader(stream, columns) : openXlsxReader(stream, columns)
}

async function openCsvReader(stream: Readable, columns: ColumnSpec[]): Promise<RowReader> {
  const parser = stream.pipe(parseCsv({ headers: false, ignoreEmpty: true, trim: true }))

  const iterator = parser[Symbol.asyncIterator]()
  const first = await iterator.next()
  if (first.done) {
    return {
      headers: { present: [], missing: columns.filter((c) => c.required).map((c) => c.header) },
      rows: emptyRows(),
    }
  }

  const { keyByIndex, result } = mapHeaders(first.value as string[], columns)

  async function* rows(): AsyncGenerator<RawRow> {
    let rowNumber = 1 // header was row 1
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      rowNumber += 1

      const cells = next.value as string[]
      const values: Record<string, string> = {}
      let hasContent = false

      keyByIndex.forEach((key, index) => {
        const value = (cells[index] ?? '').trim()
        values[key] = value
        if (value !== '') hasContent = true
      })

      // Trailing blank lines are not errors; skip them silently.
      if (hasContent) yield { rowNumber, values }
    }
  }

  return { headers: result, rows: rows() }
}

async function openXlsxReader(stream: Readable, columns: ColumnSpec[]): Promise<RowReader> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    entries: 'emit',
    sharedStrings: 'cache',
    worksheets: 'emit',
  })

  const iterator = workbook[Symbol.asyncIterator]()
  const firstSheet = await iterator.next()
  if (firstSheet.done) {
    return {
      headers: { present: [], missing: columns.filter((c) => c.required).map((c) => c.header) },
      rows: emptyRows(),
    }
  }

  const worksheet = firstSheet.value as AsyncIterable<ExcelJS.Row>
  const rowIterator = worksheet[Symbol.asyncIterator]()

  const headerRow = await rowIterator.next()
  if (headerRow.done) {
    return {
      headers: { present: [], missing: columns.filter((c) => c.required).map((c) => c.header) },
      rows: emptyRows(),
    }
  }

  const headerValues: string[] = []
  ;(headerRow.value as ExcelJS.Row).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerValues[colNumber - 1] = cellToString(cell.value)
  })

  const { keyByIndex, result } = mapHeaders(headerValues, columns)

  async function* rows(): AsyncGenerator<RawRow> {
    while (true) {
      const next = await rowIterator.next()
      if (next.done) break

      const row = next.value as ExcelJS.Row
      const values: Record<string, string> = {}
      let hasContent = false

      keyByIndex.forEach((key, index) => {
        const value = cellToString(row.getCell(index + 1).value)
        values[key] = value
        if (value !== '') hasContent = true
      })

      if (hasContent) yield { rowNumber: row.number, values }
    }
  }

  return { headers: result, rows: rows() }
}

async function* emptyRows(): AsyncGenerator<RawRow> {
  // Nothing to yield — an empty or headerless file.
}

/** Groups a row stream into fixed-size batches for transactional application. */
export async function* batched<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  let batch: T[] = []
  for await (const item of source) {
    batch.push(item)
    if (batch.length >= size) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}
