import {
  isMultiOption,
  type AnyQuoteData,
  type OptionQuoteData,
  type QuoteData,
  type SupplierBomItem,
} from './render-quote'

type CellValue = string | number | null

type Sheet = {
  name: string
  rows: CellValue[][]
}

type WorkbookFile = {
  filename: string
  bytes: Uint8Array
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function parseRands(value: string | undefined) {
  if (!value) return value ?? ''
  const normalized = value.replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : value
}

function columnName(index: number) {
  let current = index + 1
  let label = ''

  while (current > 0) {
    const remainder = (current - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    current = Math.floor((current - 1) / 26)
  }

  return label
}

function cellXml(rowIndex: number, columnIndex: number, value: CellValue) {
  if (value == null || value === '') return ''

  const ref = `${columnName(columnIndex)}${rowIndex + 1}`

  if (typeof value === 'number') {
    return `<c r="${ref}"><v>${value}</v></c>`
  }

  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`
}

function worksheetXml(rows: CellValue[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => cellXml(rowIndex, columnIndex, value))
        .filter(Boolean)
        .join('')

      return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : `<row r="${rowIndex + 1}"/>`
    })
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${body}</sheetData>`,
    '</worksheet>',
  ].join('')
}

function contentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('')

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    sheetOverrides,
    '</Types>',
  ].join('')
}

function rootRelsXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('')
}

function workbookXml(sheetNames: string[]) {
  const sheets = sheetNames
    .map((name, index) =>
      `<sheet name="${escapeXml(name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets>${sheets}</sheets>`,
    '</workbook>',
  ].join('')
}

function workbookRelsXml(sheetCount: number) {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('')

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    sheetRels,
    `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    '</Relationships>',
  ].join('')
}

function stylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>',
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
  ].join('')
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function pushU16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function pushU32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980)
  const dosTime =
    (date.getSeconds() >> 1) |
    (date.getMinutes() << 5) |
    (date.getHours() << 11)
  const dosDate =
    date.getDate() |
    ((date.getMonth() + 1) << 5) |
    ((year - 1980) << 9)

  return { dosDate, dosTime }
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }

  return output
}

function createZip(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const centralDirectory: Uint8Array[] = []
  let offset = 0
  const { dosDate, dosTime } = dosDateTime(new Date())

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = file.data
    const crc = crc32(data)

    const localHeader: number[] = []
    pushU32(localHeader, 0x04034b50)
    pushU16(localHeader, 20)
    pushU16(localHeader, 0)
    pushU16(localHeader, 0)
    pushU16(localHeader, dosTime)
    pushU16(localHeader, dosDate)
    pushU32(localHeader, crc)
    pushU32(localHeader, data.length)
    pushU32(localHeader, data.length)
    pushU16(localHeader, nameBytes.length)
    pushU16(localHeader, 0)

    chunks.push(Uint8Array.from(localHeader))
    chunks.push(nameBytes)
    chunks.push(data)

    const centralHeader: number[] = []
    pushU32(centralHeader, 0x02014b50)
    pushU16(centralHeader, 20)
    pushU16(centralHeader, 20)
    pushU16(centralHeader, 0)
    pushU16(centralHeader, 0)
    pushU16(centralHeader, dosTime)
    pushU16(centralHeader, dosDate)
    pushU32(centralHeader, crc)
    pushU32(centralHeader, data.length)
    pushU32(centralHeader, data.length)
    pushU16(centralHeader, nameBytes.length)
    pushU16(centralHeader, 0)
    pushU16(centralHeader, 0)
    pushU16(centralHeader, 0)
    pushU16(centralHeader, 0)
    pushU32(centralHeader, 0)
    pushU32(centralHeader, offset)

    centralDirectory.push(Uint8Array.from(centralHeader))
    centralDirectory.push(nameBytes)

    offset += localHeader.length + nameBytes.length + data.length
  }

  const centralBytes = concatBytes(centralDirectory)
  const eocd: number[] = []
  pushU32(eocd, 0x06054b50)
  pushU16(eocd, 0)
  pushU16(eocd, 0)
  pushU16(eocd, files.length)
  pushU16(eocd, files.length)
  pushU32(eocd, centralBytes.length)
  pushU32(eocd, offset)
  pushU16(eocd, 0)

  return concatBytes([...chunks, centralBytes, Uint8Array.from(eocd)])
}

function sectionRows(data: QuoteData) {
  return [
    ['Panels & Mounting', `${data.panelCount} x ${data.panelModel}`, parseRands(data.panelMountingSubtotal)],
    ['Cables & Connectors', 'Solar cable, MC4 sets, and panel wiring', parseRands(data.cablesSubtotal)],
    ['DC Protection', data.dcCombinerConfig, parseRands(data.dcProtectionSubtotal)],
    [
      'Inverter & Battery System',
      `${data.inverterQty} x ${data.inverterModel}; ${data.batteryQty} x ${data.batteryModel}`,
      parseRands(data.inverterBatterySubtotal),
    ],
    ['AC & DB Protection', 'Changeover, breakers, SPD, and DB work', parseRands(data.acDbSubtotal)],
    ['Earthing', `${data.earthingSpikeCount} spike system`, parseRands(data.earthingSubtotal)],
    ['Consumables & Compliance', 'Consumables, labels, and COC', parseRands(data.consumablesSubtotal)],
    ['Labour', 'Installation labour and commissioning', parseRands(data.labourSubtotal)],
  ]
}

function supplierBomRows(items: SupplierBomItem[]) {
  return items.map((item) => [
    item.section,
    item.sku,
    item.description,
    item.quantity,
    item.unitCostRands,
    item.unitSellRands,
    item.lineCostRands,
    item.lineSellRands,
  ])
}

function singleOverviewRows(data: QuoteData): CellValue[][] {
  return [
    ['Quote Number', data.quoteNumber],
    ['Customer', data.customerName],
    ['Municipality', data.municipality],
    ['Address', data.siteAddress],
    ['Date Issued', data.dateIssued],
    ['Date Expires', data.dateExpires],
    ['System Type', data.systemType],
    ['Inverter', `${data.inverterQty} x ${data.inverterModel}`],
    ['Battery', `${data.batteryQty} x ${data.batteryModel}`],
    ['Panels', `${data.panelCount} x ${data.panelModel}`],
    ['Total kWp', data.totalKwp],
    ['Monthly Usage (kWh)', data.monthlyUsageKwh],
    ['Monthly Generation (kWh)', data.monthlyGenKwh],
    ['Quote Total (R)', parseRands(data.quoteTotal)],
    ['Deposit Total (R)', parseRands(data.depositTotal)],
    ['Balance Total (R)', parseRands(data.balanceTotal)],
    ['Annual Saving (R)', parseRands(data.annualSavingR)],
    ['Payback (Years)', data.paybackYears],
  ]
}

function optionSheet(option: OptionQuoteData): Sheet {
  const supplierRows = option.supplierBom?.length
    ? [
        [],
        ['Supplier BOM'],
        ['Section', 'SKU', 'Description', 'Qty', 'Unit Cost (R)', 'Unit Sell (R)', 'Line Cost (R)', 'Line Sell (R)'],
        ...supplierBomRows(option.supplierBom),
      ]
    : []

  const rows: CellValue[][] = [
    [option.tierLabel],
    [],
    ['Field', 'Value'],
    ...singleOverviewRows(option),
    [],
    ['Section', 'Description', 'Sell (R)'],
    ...sectionRows(option),
    ...supplierRows,
    [],
    ['Deposit Item', 'Sell (R)'],
    ...option.depositItems.map((item) => [item.name, item.amountRands]),
  ]

  if (option.monthlyGenTable?.length) {
    rows.push(
      [],
      ['Month', 'Solar Gen (kWh)', 'Consumption (kWh)', 'Imported (kWh)', 'Solar Share %', 'Bill Before', 'Bill After', 'Saving'],
      ...option.monthlyGenTable.map((row) => [
        row.month,
        row.solarGenKwh,
        row.consumptionKwh,
        row.importedKwh,
        row.energyFromSolarPct,
        parseRands(row.billBefore),
        parseRands(row.billAfter),
        parseRands(row.saving),
      ]),
    )
  }

  return {
    name: option.tierLabel.replace(/[^A-Za-z0-9 ]/g, '').trim() || 'Option',
    rows,
  }
}

function buildSheets(data: AnyQuoteData): Sheet[] {
  if (isMultiOption(data)) {
    return [
      {
        name: 'Overview',
        rows: [
          ['Quote Number', data.quoteNumber],
          ['Customer', data.customerName],
          ['Municipality', data.municipality],
          ['Address', data.siteAddress],
          ['Date Issued', data.dateIssued],
          ['Date Expires', data.dateExpires],
          ['Monthly Usage (kWh)', data.monthlyUsageKwh],
        ],
      },
      {
        name: 'Comparison',
        rows: [
          ['Metric', 'Premium', 'Recommended', 'Budget'],
          ...data.comparisonTable.map((row) => [row.label, row.premium, row.recommended, row.budget]),
        ],
      },
      ...data.options.map((option) => optionSheet(option)),
    ]
  }

  const single = data as QuoteData
  const sheets: Sheet[] = [
    {
      name: 'Overview',
      rows: singleOverviewRows(single),
    },
    {
      name: 'Quote',
      rows: [
        ['Section', 'Description', 'Sell (R)'],
        ...sectionRows(single),
        ...(single.supplierBom?.length
          ? [
              [],
              ['Supplier BOM'],
              ['Section', 'SKU', 'Description', 'Qty', 'Unit Cost (R)', 'Unit Sell (R)', 'Line Cost (R)', 'Line Sell (R)'],
              ...supplierBomRows(single.supplierBom),
            ]
          : []),
        [],
        ['Deposit Item', 'Sell (R)'],
        ...single.depositItems.map((item) => [item.name, item.amountRands]),
      ],
    },
  ]

  if (single.monthlyGenTable?.length) {
    sheets.push({
      name: 'Monthly Generation',
      rows: [
        ['Month', 'Solar Gen (kWh)', 'Consumption (kWh)', 'Imported (kWh)', 'Solar Share %', 'Bill Before', 'Bill After', 'Saving'],
        ...single.monthlyGenTable.map((row) => [
          row.month,
          row.solarGenKwh,
          row.consumptionKwh,
          row.importedKwh,
          row.energyFromSolarPct,
          parseRands(row.billBefore),
          parseRands(row.billAfter),
          parseRands(row.saving),
        ]),
      ],
    })
  }

  if (single.twentyYearTable?.length) {
    sheets.push({
      name: '20 Year Model',
      rows: [
        ['Year', 'Consumption (kWh)', 'Solar Gen (kWh)', 'Bill Before', 'Bill After', 'Annual Saving', 'Cumulative Impact'],
        ...single.twentyYearTable.map((row) => [
          row.year,
          parseRands(row.consumptionKwh),
          parseRands(row.solarGenKwh),
          parseRands(row.billBefore),
          parseRands(row.billAfter),
          parseRands(row.annualSaving),
          parseRands(row.cumulativeImpact),
        ]),
      ],
    })
  }

  return sheets
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function buildQuoteWorkbook(data: AnyQuoteData): WorkbookFile {
  const sheets = buildSheets(data)
  const encoder = new TextEncoder()
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml(sheets.length)) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml()) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheets.map((sheet) => sheet.name))) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml(sheets.length)) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(worksheetXml(sheet.rows)),
    })),
  ]

  const filenameBase = safeFilename(data.quoteNumber || data.customerName || 'haberl-quote')

  return {
    filename: `${filenameBase}-supplier-bom.xlsx`,
    bytes: createZip(files),
  }
}
