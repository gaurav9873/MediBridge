import { Injectable } from '@nestjs/common'
import { type ColumnSpec, ERROR_COLUMN_HEADER } from '@medibridge/types'
import ExcelJS from 'exceljs'
import { format as formatCsv } from 'fast-csv'
import { FileStorage } from '../storage/file-storage'

/**
 * Generates the three files the wizard hands back: the blank template, the
 * error file, and the row-by-row result report.
 *
 * The error file is the important one. It carries the SAME columns as the
 * template plus an `Error` column, which is what makes "fix the 12 bad rows
 * and re-upload this exact file" work — the reader ignores the extra column,
 * so nothing has to be deleted first.
 */
@Injectable()
export class ReportWriter {
  constructor(private readonly storage: FileStorage) {}

  /**
   * A blank template with three header rows: the column names, a filled-in
   * example, and the guidance text. Frozen and width-adjusted so it is usable
   * the moment it opens.
   */
  async buildTemplate(columns: ColumnSpec[], sheetName: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'MediBridge B2B'
    const sheet = workbook.addWorksheet(sheetName.slice(0, 31))

    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.max(16, column.header.length + 4),
    }))

    // Row 1 — headers.
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D7490' } }
    headerRow.alignment = { vertical: 'middle' }
    headerRow.height = 22

    // Row 2 — a worked example, so nobody guesses the date or number format.
    const exampleRow = sheet.addRow(
      Object.fromEntries(columns.map((column) => [column.key, column.example])),
    )
    exampleRow.font = { italic: true, color: { argb: 'FF6B7280' } }

    // Row 3 — one sentence of guidance per column, plus whether it is required.
    const helpRow = sheet.addRow(
      Object.fromEntries(
        columns.map((column) => [
          column.key,
          `${column.required ? 'Required. ' : 'Optional. '}${column.help}${
            column.options ? ` One of: ${column.options.join(', ')}` : ''
          }`,
        ]),
      ),
    )
    helpRow.font = { size: 9, color: { argb: 'FF9CA3AF' } }
    helpRow.alignment = { wrapText: true, vertical: 'top' }
    helpRow.height = 40

    sheet.views = [{ state: 'frozen', ySplit: 3 }]

    // A note telling the user to delete the two guide rows before uploading.
    // The reader tolerates them anyway (they fail validation as rows), but
    // saying so avoids two confusing error lines on every first import.
    sheet.addRow({})
    const note = sheet.addRow({
      [columns[0]?.key ?? 'note']: 'Delete rows 2 and 3, then add your data from row 2 onwards.',
    })
    note.font = { bold: true, color: { argb: 'FFB45309' } }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  /**
   * Failed rows, in template format, with the reason appended.
   *
   * CSV rather than xlsx: it re-imports cleanly, opens in Excel, and streams
   * without holding the whole thing in memory.
   */
  async writeErrorFile(
    key: string,
    columns: ColumnSpec[],
    rows: AsyncIterable<{ raw: Record<string, string>; message: string }>,
  ): Promise<void> {
    const out = await this.storage.createWriteStream(key)
    const csv = formatCsv({ headers: [...columns.map((c) => c.header), ERROR_COLUMN_HEADER] })
    csv.pipe(out)

    for await (const row of rows) {
      csv.write([...columns.map((column) => row.raw[column.key] ?? ''), row.message])
    }

    csv.end()
    await new Promise<void>((resolve, reject) => {
      out.on('finish', resolve)
      out.on('error', reject)
    })
  }

  /** Row-by-row outcome of the apply pass — the "success report". */
  async writeResultFile(
    key: string,
    rows: AsyncIterable<{ rowNumber: number; key: string; action: string; detail?: string }>,
  ): Promise<void> {
    const out = await this.storage.createWriteStream(key)
    const csv = formatCsv({ headers: ['Row', 'Record', 'Result', 'Details'] })
    csv.pipe(out)

    for await (const row of rows) {
      csv.write([row.rowNumber, row.key, row.action, row.detail ?? ''])
    }

    csv.end()
    await new Promise<void>((resolve, reject) => {
      out.on('finish', resolve)
      out.on('error', reject)
    })
  }
}
