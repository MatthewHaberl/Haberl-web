// ─────────────────────────────────────────────────────────────────────────────
// Key Electric demo storefront — catalog data
//
// This is a SANDBOX CLONE of keyelectric.co.za for demonstration purposes only.
// Categories, products, prices (ex-VAT, in cents) and images are sampled from the
// live store's public WooCommerce Store API so the demo looks authentic. The real
// store has thousands of SKUs; this is a representative slice across every
// top-level category. Add/edit freely — nothing here touches the Haberl database.
// ─────────────────────────────────────────────────────────────────────────────

// Images are downloaded locally into /public/ke-demo-assets (mirroring the live
// store's YYYY/MM upload paths) so the demo is fully self-contained — no reliance
// on keyelectric.co.za staying up or allowing hot-links during a presentation.
const IMG_BASE = '/ke-demo-assets/'

/** Build a local image URL from an uploads-relative path. */
export function keImg(path: string): string {
  return IMG_BASE + path
}

export interface KeCategory {
  slug: string
  name: string
  image: string
  blurb: string
  subcategories: string[]
}

export interface KeProduct {
  slug: string
  name: string
  sku: string
  /** ex-VAT price in cents */
  priceCents: number
  /** optional was-price in cents (for sale strikethrough) */
  compareCents?: number
  categorySlug: string
  brand?: string
  /** uploads-relative path, or '' for no image (renders a fallback) */
  img: string
  onSale?: boolean
}

// ── Top-level categories (matches the live store's main menu) ────────────────
export const categories: KeCategory[] = [
  { slug: 'alternative-power-solutions', name: 'Alternative Power Solutions', image: keImg('2026/04/Alternative-Power-Solutions.png'), blurb: 'Inverters, batteries, solar mounting & EV charging.', subcategories: ['Back-up Power', 'Solar Power', 'Electric Vehicle Charger'] },
  { slug: 'cable', name: 'Cable', image: keImg('2026/04/Cable.png'), blurb: 'Solar, surfix, GP wire, armoured & control cable.', subcategories: ['Flat Twin & Earth', 'Solar Cable', 'General Purpose Wire', 'SWA Cable'] },
  { slug: 'cable-management', name: 'Cable Management', image: keImg('2026/04/Cable-Management.png'), blurb: 'Conduit, trunking, saddles & cable tray.', subcategories: ['Conduit', 'Trunking', 'Saddles & Clips', 'Cable Tray'] },
  { slug: 'cable-terminals', name: 'Cable Terminals', image: keImg('2025/03/LS0080.png'), blurb: 'Lugs, ferrules, disconnects & crimp terminals.', subcategories: ['Insulated Lugs', 'Bootlace Ferrules', 'Disconnects'] },
  { slug: 'coc-booklet', name: 'COC Booklet', image: keImg('2026/04/COC-with-Sparky-01.png'), blurb: 'Certificate of Compliance booklets.', subcategories: ['ECA Members', 'Non-ECA Members'] },
  { slug: 'enclosures', name: 'Enclosures', image: keImg('2026/04/Enclosures.png'), blurb: 'Distribution boards, DB boxes & PVC enclosures.', subcategories: ['Distribution Boards', 'Empty PVC Enclosures', 'Junction Boxes'] },
  { slug: 'glands-shrouds', name: 'Glands & Shrouds', image: keImg('2026/04/Glands-Shrouds.png'), blurb: 'Cable glands, shrouds & accessories.', subcategories: ['Cable Glands', 'Cable Shrouds'] },
  { slug: 'hardware', name: 'Hardware', image: keImg('2026/04/Hardware.png'), blurb: 'Hand tools, fasteners, tape, PPE & sundries.', subcategories: ['Hand Tools', 'Fasteners', 'Insulation Tape', 'PPE'] },
  { slug: 'indoor-lighting', name: 'Indoor Lighting', image: keImg('2026/04/Indoor-Lighting.png'), blurb: 'Bulbs, downlights, ceiling & emergency lights.', subcategories: ['Bulbs', 'Ceiling Lights', 'Rechargeable Emergency Light'] },
  { slug: 'labelling', name: 'Labelling', image: keImg('2026/04/Labelling.png'), blurb: 'Cable markers, label tape & signage.', subcategories: ['Cable Markers', 'Label Tape', 'Signage'] },
  { slug: 'outdoor-lighting', name: 'Outdoor Lighting', image: keImg('2026/04/Outdoor-Lighting.png'), blurb: 'Floodlights, bulkheads & outdoor fittings.', subcategories: ['Floodlight', 'Light Fittings'] },
  { slug: 'plugs-sockets-switches', name: 'Plugs, Sockets & Switches', image: keImg('2026/04/Plugs-Sockets-Switches.jpg'), blurb: 'Sockets, switches, modules & cover plates.', subcategories: ['Sockets', 'Switches', 'Covers & Modules'] },
  { slug: 'switchgear', name: 'Switchgear', image: keImg('2026/04/Switch-gear.png'), blurb: 'Breakers, isolators, earth leakage & contactors.', subcategories: ['Circuit Breakers', 'Isolators', 'Earth Leakage'] },
  { slug: 'terminals-insulators', name: 'Terminals & Insulators', image: keImg('2026/04/Terminals-and-insulators.png'), blurb: 'DIN terminals, heatshrink & insulators.', subcategories: ['DIN Rail Terminals', 'Heatshrink', 'Insulators'] },
]

export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug)

// ── Products (real SKUs / prices ex-VAT in cents / live store images) ─────────
const raw: Omit<KeProduct, 'slug'>[] = [
  // Alternative Power Solutions
  { name: 'LBSA Rhino Intelliflex 71.8kWh High Voltage Battery – 691V, 104Ah', sku: 'HVBAT71.8KW', priceCents: 20370142, categorySlug: 'alternative-power-solutions', brand: 'LBSA', img: '2025/12/HVBAT71.8KW-1.png' },
  { name: 'IES Battery – 215.04kWh, 280Ah, 768V', sku: 'IES-BATT-215R', priceCents: 59453317, categorySlug: 'alternative-power-solutions', brand: 'IES', img: '2025/10/IES-BATT-215R.png' },
  { name: 'LX Solar – Klip-Lok / Safloc Mount Clamp 700', sku: 'LM-KS-700-F', priceCents: 4175, categorySlug: 'alternative-power-solutions', brand: 'LX Solar', img: '2025/03/4114_LM-KS-700-F_Default.png' },
  { name: 'LX Solar – IBR Mount Bracket Low Trap (Flat Top + EPDM)', sku: 'LM-TBR-VF', priceCents: 2869, categorySlug: 'alternative-power-solutions', brand: 'LX Solar', img: '2025/03/2592_LM-TBR-VF_Default.png' },
  { name: 'LX Solar Winged Nut Set – T5 Aluminium', sku: 'LM-RNW-SET', priceCents: 686, categorySlug: 'alternative-power-solutions', brand: 'LX Solar', img: '2026/01/LM-RNW-SET.png' },
  { name: 'LX Frame Clip Hold – 2× PV Cable Clip (SUS304 Stainless)', sku: 'LM-CAB-CLIP2', priceCents: 242, categorySlug: 'alternative-power-solutions', brand: 'LX Solar', img: '2025/03/LM-CAB-CLIP2.png' },
  { name: 'LX Solar – Circular Earthing / Ground Washer (SUS304)', sku: 'LM-CGW', priceCents: 418, categorySlug: 'alternative-power-solutions', brand: 'LX Solar', img: '2025/03/3985_LM-CGW_Default.png' },

  // Cable
  { name: 'Solar Cable 4mm² Red – 1000VDC, TUV Certified, Tinned Copper (44A) – Per Metre', sku: 'PV1-F-4MM-RED', priceCents: 1248, categorySlug: 'cable', brand: 'Helukabel', img: '2025/03/PV1-F-4MM-RED.png', onSale: true, compareCents: 1499 },
  { name: 'Solar Cable 4mm² Black – 1000VDC, TUV Certified, Tinned Copper (44A) – Per Metre', sku: 'PV1-F-4MM-BLK', priceCents: 1248, categorySlug: 'cable', brand: 'Helukabel', img: '2025/03/PV1-F-4MM-BLK.png', onSale: true, compareCents: 1499 },
  { name: '10mm Red Solar Cable – Per Metre', sku: 'SOLAR10RED', priceCents: 3224, categorySlug: 'cable', img: '2025/03/SOLAR10RED.png' },
  { name: 'Surfix 1.5mm² × 2c + E Brown, 300/500V (22A) – Per Metre', sku: 'SURF1.5X2BROWN', priceCents: 1636, categorySlug: 'cable', img: '2025/03/SURF1.5X2BROWN.png' },
  { name: 'Surfix 4.0mm × 2c + E White, 300/500V (40A) – Per Metre', sku: 'SURF4.0X2WHITE', priceCents: 3572, categorySlug: 'cable', img: '2025/03/17062_SURF4.0X2WHITE_Default.png' },
  { name: 'GP Wire 16mm² Red 600/1000V (78A) – Per Metre', sku: 'GPW16.0RED', priceCents: 4770, categorySlug: 'cable', img: '2025/03/16944_GPW16.0RED_Default.png' },
  { name: 'PVC/SWA/PVC 16mm² × 4C Aluminium FR Cable – 600/1000V (69A) – Per Metre', sku: 'SWA16X4ALU', priceCents: 9536, categorySlug: 'cable', img: '2025/03/SWA16X4ALU.png' },
  { name: 'Bare Copper Earth Wire 4.0mm² – Per Metre', sku: 'BCEW4.0MM-MTR', priceCents: 1158, categorySlug: 'cable', img: '2025/03/16800_BCEW4.0MM-MTR_Default.png' },
  { name: 'Mylar Control Cable – 1.0mm² × 1 Pair (2 Core), Grey, 300/500V', sku: 'MYLAR1.0X2C', priceCents: 944, categorySlug: 'cable', img: '2025/03/17018_MYLAR1.0X2C_Default.png' },
  { name: 'Fire Alarm Cable 0.8mm² × 2 Core – Red', sku: 'FR20-2C', priceCents: 778, categorySlug: 'cable', img: '2025/03/16999_FR20-2C_Default.png' },

  // Cable Management
  { name: 'Kopex 25mm Steel PVC-Coated Flexible Conduit', sku: 'PFC-2530', priceCents: 2380, categorySlug: 'cable-management', brand: 'Kopex', img: '2025/03/11159_PFC-2530_Default.png' },
  { name: 'PVC 20mm SABS Conduit – 4m', sku: '20MMSABS', priceCents: 1674, categorySlug: 'cable-management', img: '2025/03/20MMSABS.png' },
  { name: 'PVC 25mm Coupling', sku: '25MMCOUPLING', priceCents: 137, categorySlug: 'cable-management', img: '2025/03/25MMCOUPLING.png' },
  { name: 'PVC 20mm Male Adaptor', sku: '20MMMALEADT', priceCents: 101, categorySlug: 'cable-management', img: '2025/03/11191_20MMMALEADT_Default.png' },
  { name: '25mm Galvanised Steel Spacer Bar Saddle', sku: 'SADGALHOS25', priceCents: 502, categorySlug: 'cable-management', img: '2025/03/SADGALHOS25.png' },
  { name: 'OBO M25 Quick Clip (Saddle) – Grey', sku: '2149016', priceCents: 390, categorySlug: 'cable-management', brand: 'OBO', img: '2025/03/2366_2149016_Default.png' },

  // Cable Terminals
  { name: 'Copper Cable Lug – 2.5mm² × 5mm', sku: 'LS0080', priceCents: 153, categorySlug: 'cable-terminals', img: '2025/03/LS0080.png' },
  { name: 'Insulated Blue Piggyback 6.3mm', sku: '2PB', priceCents: 199, categorySlug: 'cable-terminals', img: '2025/03/2PB.png' },
  { name: 'Insulated Lug – Blue Disconnect Female 6.4mm', sku: '2DF', priceCents: 124, categorySlug: 'cable-terminals', img: '2025/03/2DF.png' },
  { name: 'Insulated Bootlace Ferrule – Blue, Double Crimp, 2.5mm (Pack of 100)', sku: 'TE2513BL', priceCents: 9732, categorySlug: 'cable-terminals', img: '2025/03/TE2513BL.png' },
  { name: 'Insulated Bootlace Ferrule 4.0mm – Orange', sku: 'E4012OR', priceCents: 87, categorySlug: 'cable-terminals', img: '2025/03/9315_E4012OR_Default.png' },

  // COC Booklet
  { name: 'COC Booklet for Non-ECA Members (20 per booklet)', sku: 'HVL-NM', priceCents: 11800, categorySlug: 'coc-booklet', img: '2025/03/HVL-NM.png' },
  { name: 'COC Booklet for ECA Members (20 per booklet)', sku: 'HVL-ECA', priceCents: 9500, categorySlug: 'coc-booklet', img: '' },

  // Enclosures
  { name: 'Hager 18-Way Surface Distribution Board – Solid Door', sku: 'VS118PF', priceCents: 50418, categorySlug: 'enclosures', brand: 'Hager', img: '2025/03/VS118PF-1.png' },
  { name: 'Hager 8-Way Surface Distribution Board – Transparent Door', sku: 'VS108TJ', priceCents: 33000, categorySlug: 'enclosures', brand: 'Hager', img: '2025/03/VS108TJ.png' },
  { name: 'Hager 18-Way Flush Distribution Board – Transparent Door', sku: 'VL18U', priceCents: 35674, categorySlug: 'enclosures', brand: 'Hager', img: '2025/03/VL18U.png' },
  { name: 'DB Eave Box – 9-Way DIN Rail, Grey', sku: 'WD9D', priceCents: 23360, categorySlug: 'enclosures', img: '2025/03/WD9D.png' },
  { name: 'Wall Box 4×4 PVC', sku: 'WALL4X4PVC', priceCents: 616, categorySlug: 'enclosures', img: '2025/03/WALL4X4PVC.png' },

  // Glands & Shrouds
  { name: 'Metal Cable Gland – Size 2 (for Armoured Cable)', sku: 'ACG-2', priceCents: 10640, categorySlug: 'glands-shrouds', img: '2025/03/ACG-2.png' },
  { name: 'Metal Cable Gland – Size 0 (for Armoured Cable)', sku: 'ACG-0', priceCents: 3536, categorySlug: 'glands-shrouds', img: '2025/03/ACG-0.png' },
  { name: 'CCG BW Steel Gland No 6 (SWA Cable Gland)', sku: '50306', priceCents: 83204, categorySlug: 'glands-shrouds', brand: 'CCG', img: '2025/03/2944_50306_Default.png' },

  // Hardware
  { name: 'Insulation Tape Econo 10m – Black', sku: 'INSUL6BLACK', priceCents: 440, categorySlug: 'hardware', img: '2025/03/INSUL6BLACK.png' },
  { name: 'M10 Galvanized Long Spring Nut', sku: 'SPRM10', priceCents: 544, categorySlug: 'hardware', img: '2025/03/SPRM10.png' },
  { name: 'Polysaddle 12mm Black Round Cable Clips (Each)', sku: 'POLY12RNDBLK', priceCents: 36, categorySlug: 'hardware', img: '2025/03/POLY12RNDBLK.png' },
  { name: 'LX Screw Hex Head Self Tap 5.5×25mm + Washer (Class 4)', sku: 'FS-S-SP-25X5.5-C3', priceCents: 202, categorySlug: 'hardware', img: '2026/01/FS-S-SP-25X5.5-C3.png' },
  { name: 'Crimp Tool – Bootlace Ferrule, 25–35mm', sku: 'YAC17', priceCents: 76213, categorySlug: 'hardware', img: '2025/03/YAC17-1.png' },
  { name: 'Energizer 12V Alkaline Battery A23 – 1 Pack', sku: 'A23BP1', priceCents: 3375, categorySlug: 'hardware', brand: 'Energizer', img: '2025/03/A23BP1.jpg' },

  // Indoor Lighting
  { name: 'Eurolux Rechargeable Emergency Light 8W 5500K', sku: 'FS276', priceCents: 7196, categorySlug: 'indoor-lighting', brand: 'Eurolux', img: '2026/06/FS276.png', onSale: true, compareCents: 8995 },
  { name: 'HUAYI 7W GU10 Spotlight LED Bulb 6000K Daylight', sku: 'SAGU02076', priceCents: 5363, categorySlug: 'indoor-lighting', brand: 'Huayi', img: '2025/03/15260_SAGU02076_Default.png' },
  { name: 'Starlit 24W LED Ceiling Light – Round, Opal Lens, 6000K Daylight', sku: '8603', priceCents: 19621, categorySlug: 'indoor-lighting', brand: 'Starlit', img: '2025/03/8603.png' },
  { name: 'Starlit 12W LED Ceiling Light – Metal Base, 230mm Ø, Daylight', sku: '8601', priceCents: 13733, categorySlug: 'indoor-lighting', brand: 'Starlit', img: '2025/03/8601.png' },

  // Labelling
  { name: 'Klemsan Cable Marker “T” – Yellow, 4–6mm² (Pack of 200)', sku: '519534-T', priceCents: 6000, categorySlug: 'labelling', brand: 'Klemsan', img: '2025/08/519534-T.png' },
  { name: 'Klemsan Cable Marker “P” – Yellow, 1.5–2.5mm² (Pack of 200)', sku: '519524-P', priceCents: 5280, categorySlug: 'labelling', brand: 'Klemsan', img: '2025/08/519524-P.png' },
  { name: 'Construction Vehicle Sticker – Reflective Yellow 600 × 120mm', sku: 'CONSTRUCTION-VEHICLE', priceCents: 11520, categorySlug: 'labelling', img: '2025/03/9214_CONSTRUCTION-VEHICLE_Default.png' },

  // Outdoor Lighting
  { name: '400W LED Floodlight – Daylight', sku: 'ZY109-400D', priceCents: 280000, categorySlug: 'outdoor-lighting', img: '2025/03/18971_ZY109-400D_Default.png' },
  { name: 'MES Atlas LED Floodlight – 50W, 6000K, 4500lm, Surge Protected', sku: 'ML-AT-50W-6K', priceCents: 29850, categorySlug: 'outdoor-lighting', brand: 'MES', img: '2025/03/8735_ML-AT-50W-6K_Default.png' },

  // Plugs, Sockets & Switches
  { name: 'Onesto Matrix Black SSO Socket Module with USB-A & USB-C', sku: 'BK-MXM-C001', priceCents: 57300, categorySlug: 'plugs-sockets-switches', brand: 'Onesto', img: '2026/06/BK-MXM-C001.png' },
  { name: 'Onesto Matrix Intermediate Switch Module – Black', sku: 'BK-MXM-001I', priceCents: 11600, categorySlug: 'plugs-sockets-switches', brand: 'Onesto', img: '2026/06/BK-MXM-001I.png' },
  { name: 'Onesto Matrix Unswitched Schuko Socket Module – Black', sku: 'BK-MXM-S001RSA', priceCents: 7600, categorySlug: 'plugs-sockets-switches', brand: 'Onesto', img: '2026/06/BK-MXM-S001RSA.png' },
  { name: 'Onesto Matrix Telephone Module – Black', sku: 'BK-MXM-001TEL', priceCents: 7100, categorySlug: 'plugs-sockets-switches', brand: 'Onesto', img: '2026/06/BK-MXM-001TEL.png' },
  { name: 'Onesto Matrix Large Blank Module – Black', sku: 'BK-MXM-003BNK', priceCents: 2700, categorySlug: 'plugs-sockets-switches', brand: 'Onesto', img: '2026/06/BK-MXM-003BNK.png' },
  { name: 'Veti Digital Thermostat with Isolator Switch 4×4 – White', sku: 'THERMO1WWT', priceCents: 98240, categorySlug: 'plugs-sockets-switches', brand: 'Veti', img: '2025/03/THERMO1WWT.png' },

  // Switchgear
  { name: 'Riken 400A 3-Pole MCCB (Moulded Case Circuit Breaker) 50kA', sku: 'RKM1-400L-400', priceCents: 218297, categorySlug: 'switchgear', brand: 'Riken', img: '2025/03/RKM1-400L-400.png' },
  { name: 'Riken 250A 3-Pole MCCB (Moulded Case Circuit Breaker) 35kA', sku: 'RKM1-250L-250', priceCents: 83218, categorySlug: 'switchgear', brand: 'Riken', img: '2025/03/RKM1-250L-250.png' },
  { name: 'CBI 80A 3P+N Earth Leakage Isolator – 6kA, Mini Rail', sku: 'SF36C', priceCents: 242579, categorySlug: 'switchgear', brand: 'CBI', img: '2025/03/SF36C.png' },
  { name: 'CBI 60A 3P+N Earth Leakage with Overload Protection – 6kA', sku: 'SF36A60A', priceCents: 288788, categorySlug: 'switchgear', brand: 'CBI', img: '2025/03/SF36A60A.png' },
  { name: 'Enclosed Isolator Switch – 63A, 4-Pole, IP65 Weatherproof, Lockable', sku: 'TH-EA09', priceCents: 17454, categorySlug: 'switchgear', img: '2025/03/TH-EA09.png' },
  { name: 'Enclosed Isolator Switch – 32A, 4-Pole, IP65, Lockable', sku: 'TH-EA08', priceCents: 16000, categorySlug: 'switchgear', img: '2025/03/TH-EA08.png' },

  // Terminals & Insulators
  { name: 'Klemsan 2.5mm² DIN Rail Mount Screw Terminal', sku: '304120', priceCents: 656, categorySlug: 'terminals-insulators', brand: 'Klemsan', img: '2025/03/11856_304120_Default.png' },
  { name: '38.1mm Heatshrink Clear – Per Metre', sku: 'HSCB0381-C', priceCents: 5232, categorySlug: 'terminals-insulators', img: '2025/03/18019_HSCB0381-C_Default.png' },
  { name: 'Midget Screwit Connector – Porcelain', sku: 'CD0001', priceCents: 74, categorySlug: 'terminals-insulators', img: '' },
]

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const products: KeProduct[] = raw.map((p) => ({ ...p, slug: slugify(p.sku) }))

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug)
export const productsByCategory = (slug: string) => products.filter((p) => p.categorySlug === slug)

/** Featured "In-Store Specials" for the home page. */
export const featuredSkus = ['BK-MXM-C001', 'FS276', 'PV1-F-4MM-RED', 'VS108TJ', 'ML-AT-50W-6K', 'TH-EA09', 'HVL-NM', '8603']
export const featuredProducts = featuredSkus
  .map((sku) => products.find((p) => p.sku === sku))
  .filter((p): p is KeProduct => Boolean(p))

/** Brand names for the "Shop by Brand" marquee. */
export const brands = [
  'ABB', 'Schneider', 'Hager', 'CBI', 'Chint', 'Legrand', 'Crabtree', 'Major Tech',
  'Philips', 'Osram', 'Eurolux', 'Klemsan', 'Veti', 'Onesto', 'Riken', 'OBO',
  'Kopex', 'Helukabel', 'Makita', 'Stanley',
]

/** Price bands for the shop sidebar filter (cents). */
export const priceBands = [
  { label: 'Under R100', min: 0, max: 9999 },
  { label: 'R100 – R500', min: 10000, max: 50000 },
  { label: 'R500 – R2 000', min: 50000, max: 200000 },
  { label: 'R2 000 – R10 000', min: 200000, max: 1000000 },
  { label: 'Over R10 000', min: 1000000, max: Infinity },
]
