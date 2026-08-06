import { PrismaPg } from '@prisma/adapter-pg'
import argon2 from 'argon2'
import { PrismaClient } from '../src/generated/prisma/client'
import { requireDatabaseUrl } from './load-env'
import { seedMedicines } from './seed/medicines'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
})

/**
 * Development seed.
 *
 * The geography here is real. Distances between the seeded distributors and
 * retailers are chosen so that the Same-Day radius logic produces a mix of
 * outcomes out of the box:
 *
 *   Sharma Medical (Camp, Pune)     -> MedPlus hub (Hadapsar)  ~5 km   SAME_DAY
 *   Sharma Medical (Camp, Pune)     -> Wellness hub (Mumbai)   ~120 km NEXT_DAY
 *   Kumar Pharmacy (Andheri, Mumbai)-> Wellness hub (Mumbai)   ~7 km   SAME_DAY
 *   Kumar Pharmacy (Andheri, Mumbai)-> MedPlus hub (Pune)      ~120 km NEXT_DAY
 *
 * Everyone signs in with the same password so nobody has to look it up.
 */
/**
 * Shared password for every seeded account.
 *
 * Documented in docs/DEV-ACCOUNTS.md — update both together. Override per-run
 * with SEED_PASSWORD when you want something that is not in the repository.
 */
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'Medibridge@123'

/** Rupees -> paise, so the tables below stay readable. */
const rs = (rupees: number): number => Math.round(rupees * 100)

/** A date `months` from today, for batch expiries. */
function monthsFromNow(months: number): Date {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  date.setHours(0, 0, 0, 0)
  return date
}

async function clearAll(): Promise<void> {
  // Order matters: children before parents.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "settlement_items", "settlements", "refunds", "payments",
      "problem_reports", "deliveries", "order_status_history", "order_items",
      "orders", "order_groups", "cart_items", "carts",
      "stock_reservations", "inventory_items",
      "medicine_requests", "medicines",
      "notification_preferences", "notifications", "audit_logs",
      "refresh_tokens", "documents",
      "distributor_profiles", "retailer_profiles", "addresses", "users",
      "settings"
    RESTART IDENTITY CASCADE
  `)
}

/**
 * Platform-wide rules. Everything here is editable from Admin > Settings
 * without a deploy — which is the whole reason this table exists.
 */
async function seedSettings(): Promise<void> {
  const settings = [
    {
      key: 'delivery.defaultRadiusKm',
      value: 25,
      description: 'Orders within this distance are eligible for Same-Day Delivery.',
    },
    {
      key: 'delivery.defaultCutoffTime',
      value: '14:00',
      description: 'Orders placed after this time will be delivered the next day.',
    },
    {
      key: 'payment.tokenPercent',
      value: 20,
      description: 'How much of the order total a retailer pays online to confirm it.',
    },
    {
      key: 'payment.platformFeePercent',
      value: 2,
      description: 'What MediBridge keeps from each order, as a percentage.',
    },
    {
      key: 'order.acceptWindowHours',
      value: 2,
      description: 'How long a distributor has to accept before the order is cancelled.',
    },
    {
      key: 'order.stockHoldMinutes',
      value: 15,
      description: 'How long we reserve stock while a retailer completes their payment.',
    },
    {
      key: 'inventory.expiryWarningDays',
      value: 90,
      description: 'How many days before expiry we warn distributors about a batch.',
    },
    {
      key: 'inventory.minShelfLifeDays',
      value: 30,
      description: 'A batch with less shelf life than this cannot be listed for sale.',
    },
    {
      key: 'compliance.blockedSchedules',
      value: ['X'],
      description: 'Drug schedules that cannot be sold on MediBridge.',
    },
    {
      key: 'account.licenseExpiryWarningDays',
      value: 30,
      description: 'How many days before expiry we start reminding users to renew.',
    },
  ]

  for (const setting of settings) {
    await prisma.setting.create({ data: setting })
  }
  console.log(`  ${settings.length} platform settings`)
}

interface SeedAddress {
  label: string
  line1: string
  city: string
  state: string
  pincode: string
  latitude: number
  longitude: number
}

async function createUserWithAddress(params: {
  role: 'ADMIN' | 'RETAILER' | 'DISTRIBUTOR'
  fullName: string
  phone: string
  email: string
  address?: SeedAddress
}): Promise<{ userId: string; addressId?: string }> {
  const passwordHash = await argon2.hash(DEV_PASSWORD)
  const now = new Date()

  const user = await prisma.user.create({
    data: {
      phone: params.phone,
      email: params.email,
      passwordHash,
      fullName: params.fullName,
      role: params.role,
      accountStatus: 'ACTIVE',
      phoneVerifiedAt: now,
      emailVerifiedAt: now,
    },
  })

  if (!params.address) return { userId: user.id }

  const address = await prisma.address.create({
    data: {
      userId: user.id,
      label: params.address.label,
      line1: params.address.line1,
      city: params.address.city,
      state: params.address.state,
      pincode: params.address.pincode,
      contactPhone: params.phone,
      latitude: params.address.latitude,
      longitude: params.address.longitude,
      isDefault: true,
    },
  })

  return { userId: user.id, addressId: address.id }
}

/** An approved drug licence and GST certificate, so the account can order. */
async function approveDocuments(params: {
  userId: string
  adminId: string
  licenseNumber: string
  gstNumber: string
  expiresOn: Date
}): Promise<void> {
  const now = new Date()
  await prisma.document.createMany({
    data: [
      {
        userId: params.userId,
        type: 'DRUG_LICENSE',
        number: params.licenseNumber,
        expiresOn: params.expiresOn,
        fileKey: `seed/licenses/${params.userId}.pdf`,
        fileName: 'drug-license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 248_000,
        verificationStatus: 'APPROVED',
        reviewedById: params.adminId,
        reviewedAt: now,
      },
      {
        userId: params.userId,
        type: 'GST_CERTIFICATE',
        number: params.gstNumber,
        fileKey: `seed/gst/${params.userId}.pdf`,
        fileName: 'gst-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 156_000,
        verificationStatus: 'APPROVED',
        reviewedById: params.adminId,
        reviewedAt: now,
      },
    ],
  })
}

async function main(): Promise<void> {
  console.log('Seeding MediBridge development data\n')

  await clearAll()
  console.log('Cleared existing data')

  console.log('\nSettings')
  await seedSettings()

  // --- Admin -------------------------------------------------------------
  console.log('\nUsers')
  const admin = await createUserWithAddress({
    role: 'ADMIN',
    fullName: 'Priya Nair',
    phone: '9000000001',
    email: 'admin@medibridge.in',
  })
  console.log('  Admin        admin@medibridge.in / 9000000001')

  // --- Distributors ------------------------------------------------------
  const medplus = await createUserWithAddress({
    role: 'DISTRIBUTOR',
    fullName: 'Anil Deshmukh',
    phone: '9000000010',
    email: 'anil@medpluswholesale.in',
    address: {
      label: 'Hadapsar Warehouse',
      line1: 'Unit 4, Fortune Industrial Estate, Hadapsar',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411028',
      latitude: 18.5089,
      longitude: 73.926,
    },
  })
  await approveDocuments({
    userId: medplus.userId,
    adminId: admin.userId,
    licenseNumber: 'MH-PUN-20B-104521',
    gstNumber: '27AAPFU0939F1ZV',
    expiresOn: monthsFromNow(30),
  })
  const medplusProfile = await prisma.distributorProfile.create({
    data: {
      userId: medplus.userId,
      businessName: 'MedPlus Wholesale Pvt Ltd',
      gstNumber: '27AAPFU0939F1ZV',
      drugLicenseNumber: 'MH-PUN-20B-104521',
      licenseExpiresOn: monthsFromNow(30),
      hubAddressId: medplus.addressId,
      sameDayRadiusKm: 25,
      sameDayCutoffTime: '14:00',
      deliveryChargePaise: rs(50),
      freeDeliveryAbovePaise: rs(5000),
      bankAccountHolder: 'MedPlus Wholesale Pvt Ltd',
      bankAccountNumber: '50100234567890',
      bankIfsc: 'HDFC0000123',
    },
  })
  console.log('  Distributor  anil@medpluswholesale.in / 9000000010  (Pune, 25km radius)')

  const wellness = await createUserWithAddress({
    role: 'DISTRIBUTOR',
    fullName: 'Farida Shaikh',
    phone: '9000000011',
    email: 'farida@wellnessdistributors.in',
    address: {
      label: 'Andheri Depot',
      line1: 'Godown 7, Marol MIDC, Andheri East',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400093',
      latitude: 19.1136,
      longitude: 72.8697,
    },
  })
  await approveDocuments({
    userId: wellness.userId,
    adminId: admin.userId,
    licenseNumber: 'MH-MUM-21B-778120',
    gstNumber: '27AACCW1234M1Z8',
    expiresOn: monthsFromNow(18),
  })
  const wellnessProfile = await prisma.distributorProfile.create({
    data: {
      userId: wellness.userId,
      businessName: 'Wellness Distributors LLP',
      gstNumber: '27AACCW1234M1Z8',
      drugLicenseNumber: 'MH-MUM-21B-778120',
      licenseExpiresOn: monthsFromNow(18),
      hubAddressId: wellness.addressId,
      // Deliberately smaller than MedPlus, so the two behave differently.
      sameDayRadiusKm: 15,
      sameDayCutoffTime: '12:00',
      deliveryChargePaise: 0,
      bankAccountHolder: 'Wellness Distributors LLP',
      bankAccountNumber: '00112233445566',
      bankIfsc: 'ICIC0000456',
    },
  })
  console.log('  Distributor  farida@wellnessdistributors.in / 9000000011  (Mumbai, 15km radius)')

  // --- Retailers ---------------------------------------------------------
  const sharma = await createUserWithAddress({
    role: 'RETAILER',
    fullName: 'Rajesh Sharma',
    phone: '9000000020',
    email: 'rajesh@sharmamedical.in',
    address: {
      label: 'Main Shop',
      line1: 'Shop 12, Sai Complex, East Street, Camp',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      latitude: 18.5142,
      longitude: 73.879,
    },
  })
  await approveDocuments({
    userId: sharma.userId,
    adminId: admin.userId,
    licenseNumber: 'MH-PUN-20-556677',
    gstNumber: '27AADCS9876P1ZQ',
    expiresOn: monthsFromNow(14),
  })
  await prisma.retailerProfile.create({
    data: {
      userId: sharma.userId,
      businessName: 'Sharma Medical Store',
      gstNumber: '27AADCS9876P1ZQ',
      drugLicenseNumber: 'MH-PUN-20-556677',
      licenseExpiresOn: monthsFromNow(14),
    },
  })
  console.log('  Retailer     rajesh@sharmamedical.in / 9000000020  (Pune Camp)')

  const kumar = await createUserWithAddress({
    role: 'RETAILER',
    fullName: 'Sunita Kumar',
    phone: '9000000021',
    email: 'sunita@kumarpharmacy.in',
    address: {
      label: 'Andheri Shop',
      line1: 'Shop 3, Laxmi Plaza, Link Road, Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      latitude: 19.1364,
      longitude: 72.8296,
    },
  })
  await approveDocuments({
    userId: kumar.userId,
    adminId: admin.userId,
    licenseNumber: 'MH-MUM-20-334455',
    gstNumber: '27AAECK5432R1ZM',
    expiresOn: monthsFromNow(8),
  })
  await prisma.retailerProfile.create({
    data: {
      userId: kumar.userId,
      businessName: 'Kumar Pharmacy',
      gstNumber: '27AAECK5432R1ZM',
      drugLicenseNumber: 'MH-MUM-20-334455',
      licenseExpiresOn: monthsFromNow(8),
    },
  })
  console.log('  Retailer     sunita@kumarpharmacy.in / 9000000021  (Mumbai Andheri)')

  /**
   * A retailer still waiting for approval, so the pending-verification screens
   * and the "you cannot order yet" guard have something real to render.
   */
  const pending = await createUserWithAddress({
    role: 'RETAILER',
    fullName: 'Imran Qureshi',
    phone: '9000000022',
    email: 'imran@newlifechemists.in',
    address: {
      label: 'Shop',
      line1: '22, Station Road, Kalyan West',
      city: 'Thane',
      state: 'Maharashtra',
      pincode: '421301',
      latitude: 19.2437,
      longitude: 73.1355,
    },
  })
  await prisma.user.update({
    where: { id: pending.userId },
    data: { accountStatus: 'PENDING_VERIFICATION' },
  })
  await prisma.document.createMany({
    data: [
      {
        userId: pending.userId,
        type: 'DRUG_LICENSE',
        number: 'MH-THN-20-998877',
        expiresOn: monthsFromNow(20),
        fileKey: `seed/licenses/${pending.userId}.pdf`,
        fileName: 'drug-license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 302_000,
        verificationStatus: 'PENDING',
      },
      {
        userId: pending.userId,
        type: 'GST_CERTIFICATE',
        number: '27AAFCN1122L1ZP',
        fileKey: `seed/gst/${pending.userId}.pdf`,
        fileName: 'gst-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 180_000,
        verificationStatus: 'PENDING',
      },
    ],
  })
  await prisma.retailerProfile.create({
    data: {
      userId: pending.userId,
      businessName: 'New Life Chemists',
      gstNumber: '27AAFCN1122L1ZP',
    },
  })
  console.log('  Retailer     imran@newlifechemists.in / 9000000022  (awaiting approval)')

  // --- Catalogue ---------------------------------------------------------
  console.log('\nCatalogue')
  const medicineIds = new Map<string, { id: string; gstRate: number; schedule: string }>()
  for (const medicine of seedMedicines) {
    const created = await prisma.medicine.create({
      data: {
        name: medicine.name,
        brand: medicine.brand,
        composition: medicine.composition,
        form: medicine.form,
        strength: medicine.strength ?? null,
        packSize: medicine.packSize ?? null,
        manufacturer: medicine.manufacturer ?? null,
        hsnCode: medicine.hsnCode,
        gstRate: medicine.gstRate,
        schedule: medicine.schedule,
        isPrescriptionRequired: medicine.isPrescriptionRequired ?? false,
        // Schedule X is delisted the moment it is created. Belt and braces:
        // the service layer refuses it too.
        isActive: medicine.schedule !== 'X',
        createdById: admin.userId,
      },
    })
    medicineIds.set(medicine.name, {
      id: created.id,
      gstRate: medicine.gstRate,
      schedule: medicine.schedule,
    })
  }
  console.log(`  ${seedMedicines.length} medicines (1 Schedule X, delisted)`)

  // --- Inventory ---------------------------------------------------------
  //
  // Both distributors stock overlapping ranges at different prices, which is
  // what makes the retailer's price-comparison view worth building.
  console.log('\nInventory')

  interface StockRow {
    medicine: string
    batch: string
    expiryMonths: number
    mrp: number
    price: number
    qty: number
    unit: 'STRIP' | 'BOX' | 'BOTTLE' | 'VIAL' | 'TUBE' | 'PIECE' | 'PACK'
    minOrder?: number
  }

  const medplusStock: StockRow[] = [
    {
      medicine: 'Crocin Advance',
      batch: 'CRA24A091',
      expiryMonths: 20,
      mrp: 30,
      price: 24,
      qty: 500,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Dolo 650',
      batch: 'DL650B117',
      expiryMonths: 18,
      mrp: 34,
      price: 27,
      qty: 800,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Calpol 500',
      batch: 'CP500C221',
      expiryMonths: 22,
      mrp: 28,
      price: 23,
      qty: 300,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Combiflam',
      batch: 'CMB24D003',
      expiryMonths: 15,
      mrp: 55,
      price: 44,
      qty: 240,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Augmentin 625 Duo',
      batch: 'AUG625E44',
      expiryMonths: 14,
      mrp: 224,
      price: 186,
      qty: 150,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Azithral 500',
      batch: 'AZ500F812',
      expiryMonths: 16,
      mrp: 132,
      price: 108,
      qty: 200,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Pan 40',
      batch: 'PAN40G551',
      expiryMonths: 24,
      mrp: 158,
      price: 122,
      qty: 400,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Omez 20',
      batch: 'OMZ20H119',
      expiryMonths: 19,
      mrp: 112,
      price: 89,
      qty: 350,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Glycomet 500 SR',
      batch: 'GLY500J77',
      expiryMonths: 21,
      mrp: 68,
      price: 54,
      qty: 300,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Telma 40',
      batch: 'TLM40K902',
      expiryMonths: 17,
      mrp: 178,
      price: 142,
      qty: 180,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Montair LC',
      batch: 'MNT-LC-L31',
      expiryMonths: 13,
      mrp: 210,
      price: 168,
      qty: 220,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Allegra 120',
      batch: 'ALG120M64',
      expiryMonths: 20,
      mrp: 220,
      price: 178,
      qty: 160,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Shelcal 500',
      batch: 'SHL500N28',
      expiryMonths: 23,
      mrp: 128,
      price: 102,
      qty: 420,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Becosules',
      batch: 'BCS24P335',
      expiryMonths: 26,
      mrp: 42,
      price: 33,
      qty: 600,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Betadine Ointment',
      batch: 'BTD-Q-7741',
      expiryMonths: 28,
      mrp: 145,
      price: 116,
      qty: 200,
      unit: 'TUBE',
      minOrder: 5,
    },
    {
      medicine: 'Asthalin Inhaler',
      batch: 'ASTH-R-119',
      expiryMonths: 15,
      mrp: 128,
      price: 104,
      qty: 90,
      unit: 'PIECE',
      minOrder: 2,
    },
    {
      medicine: 'Thyronorm 50mcg',
      batch: 'THY50S480',
      expiryMonths: 18,
      mrp: 152,
      price: 121,
      qty: 140,
      unit: 'BOTTLE',
      minOrder: 2,
    },
    {
      medicine: 'ORS Powder',
      batch: 'ELC-T-2290',
      expiryMonths: 30,
      mrp: 22,
      price: 17,
      qty: 1200,
      unit: 'PACK',
      minOrder: 20,
    },
    // A batch close to expiry, so the "Expiring Soon" screen has real content.
    {
      medicine: 'Ciplox 500',
      batch: 'CPX500U01',
      expiryMonths: 2,
      mrp: 96,
      price: 62,
      qty: 60,
      unit: 'STRIP',
      minOrder: 5,
    },
    // A low-stock row, below its own threshold, for the dashboard warning.
    {
      medicine: 'Ondem 4',
      batch: 'OND4V771',
      expiryMonths: 16,
      mrp: 88,
      price: 70,
      qty: 6,
      unit: 'STRIP',
      minOrder: 2,
    },
  ]

  const wellnessStock: StockRow[] = [
    // Same medicines as MedPlus, cheaper — this is the comparison case.
    {
      medicine: 'Crocin Advance',
      batch: 'WCRA-A-551',
      expiryMonths: 17,
      mrp: 30,
      price: 22,
      qty: 900,
      unit: 'STRIP',
      minOrder: 20,
    },
    {
      medicine: 'Dolo 650',
      batch: 'WDL-B-6612',
      expiryMonths: 21,
      mrp: 34,
      price: 26,
      qty: 1500,
      unit: 'STRIP',
      minOrder: 20,
    },
    {
      medicine: 'Combiflam',
      batch: 'WCMB-C-303',
      expiryMonths: 19,
      mrp: 55,
      price: 42,
      qty: 500,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Augmentin 625 Duo',
      batch: 'WAUG-D-118',
      expiryMonths: 12,
      mrp: 224,
      price: 179,
      qty: 300,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Azee 500',
      batch: 'WAZE-E-447',
      expiryMonths: 18,
      mrp: 118,
      price: 92,
      qty: 260,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Pantocid 40',
      batch: 'WPTC-F-889',
      expiryMonths: 22,
      mrp: 162,
      price: 126,
      qty: 380,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Glucophage 500',
      batch: 'WGLU-G-201',
      expiryMonths: 20,
      mrp: 72,
      price: 56,
      qty: 420,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Atorva 10',
      batch: 'WATV-H-664',
      expiryMonths: 24,
      mrp: 96,
      price: 74,
      qty: 340,
      unit: 'STRIP',
      minOrder: 5,
    },
    {
      medicine: 'Amlokind 5',
      batch: 'WAML-J-125',
      expiryMonths: 25,
      mrp: 48,
      price: 36,
      qty: 560,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Cetzine 10',
      batch: 'WCTZ-K-780',
      expiryMonths: 23,
      mrp: 36,
      price: 27,
      qty: 700,
      unit: 'STRIP',
      minOrder: 20,
    },
    {
      medicine: 'Ascoril LS Syrup',
      batch: 'WASC-L-390',
      expiryMonths: 14,
      mrp: 132,
      price: 105,
      qty: 240,
      unit: 'BOTTLE',
      minOrder: 5,
    },
    {
      medicine: 'Zincovit',
      batch: 'WZNC-M-556',
      expiryMonths: 27,
      mrp: 110,
      price: 84,
      qty: 480,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Neurobion Forte',
      batch: 'WNRB-N-812',
      expiryMonths: 26,
      mrp: 42,
      price: 32,
      qty: 640,
      unit: 'STRIP',
      minOrder: 10,
    },
    {
      medicine: 'Volini Gel',
      batch: 'WVLN-P-207',
      expiryMonths: 29,
      mrp: 148,
      price: 118,
      qty: 300,
      unit: 'TUBE',
      minOrder: 5,
    },
    {
      medicine: 'Monocef 1g Injection',
      batch: 'WMNC-Q-931',
      expiryMonths: 16,
      mrp: 92,
      price: 71,
      qty: 180,
      unit: 'VIAL',
      minOrder: 5,
    },
    {
      medicine: 'Refresh Tears',
      batch: 'WRFT-R-448',
      expiryMonths: 20,
      mrp: 165,
      price: 132,
      qty: 150,
      unit: 'BOTTLE',
      minOrder: 3,
    },
    {
      medicine: 'Eltroxin 100mcg',
      batch: 'WELT-S-663',
      expiryMonths: 19,
      mrp: 188,
      price: 149,
      qty: 120,
      unit: 'BOTTLE',
      minOrder: 2,
    },
    {
      medicine: 'Limcee 500',
      batch: 'WLMC-T-100',
      expiryMonths: 24,
      mrp: 32,
      price: 24,
      qty: 800,
      unit: 'STRIP',
      minOrder: 20,
    },
  ]

  async function insertStock(distributorId: string, rows: StockRow[], label: string) {
    let inserted = 0
    for (const row of rows) {
      const medicine = medicineIds.get(row.medicine)
      if (!medicine) {
        console.warn(`  ! skipped unknown medicine: ${row.medicine}`)
        continue
      }
      // Never list a blocked schedule, even from a seed script.
      if (medicine.schedule === 'X') continue

      await prisma.inventoryItem.create({
        data: {
          distributorId,
          medicineId: medicine.id,
          batchNumber: row.batch,
          expiryDate: monthsFromNow(row.expiryMonths),
          mrpPaise: rs(row.mrp),
          sellingPricePaise: rs(row.price),
          quantity: row.qty,
          unit: row.unit,
          minOrderQuantity: row.minOrder ?? 1,
          lowStockThreshold: 10,
        },
      })
      inserted += 1
    }
    console.log(`  ${inserted} batches — ${label}`)
  }

  await insertStock(medplusProfile.id, medplusStock, 'MedPlus Wholesale (Pune)')
  await insertStock(wellnessProfile.id, wellnessStock, 'Wellness Distributors (Mumbai)')

  // --- Sanity check ------------------------------------------------------
  //
  // Proves the PostGIS generated column and index actually work, using the
  // exact query shape the delivery module will run in Phase 4.
  console.log('\nDelivery radius check (ST_DWithin against seeded geography)')
  const radiusCheck = await prisma.$queryRawUnsafe<
    Array<{ retailer: string; distributor: string; distance_km: number; same_day: boolean }>
  >(`
    SELECT
      r.label AS retailer,
      d.label AS distributor,
      ROUND((ST_Distance(r.location, d.location) / 1000)::numeric, 1)::float8 AS distance_km,
      ST_DWithin(r.location, d.location, dp."sameDayRadiusKm" * 1000) AS same_day
    FROM "addresses" r
    JOIN "users" ru ON ru.id = r."userId" AND ru.role = 'RETAILER'
    CROSS JOIN "addresses" d
    JOIN "distributor_profiles" dp ON dp."hubAddressId" = d.id
    WHERE ru."accountStatus" = 'ACTIVE'
    ORDER BY r.label, distance_km
  `)
  for (const row of radiusCheck) {
    const verdict = row.same_day ? 'SAME_DAY' : 'NEXT_DAY'
    console.log(
      `  ${row.retailer.padEnd(16)} -> ${row.distributor.padEnd(20)} ${String(row.distance_km).padStart(6)} km  ${verdict}`,
    )
  }

  // --- Full-text search check -------------------------------------------
  console.log('\nSearch check (weighted tsvector)')
  const searchCheck = await prisma.$queryRawUnsafe<Array<{ name: string; rank: number }>>(`
    SELECT name, ROUND(ts_rank("searchVector", websearch_to_tsquery('english', 'paracetamol'))::numeric, 4)::float8 AS rank
    FROM "medicines"
    WHERE "searchVector" @@ websearch_to_tsquery('english', 'paracetamol')
      AND "isActive" = true
    ORDER BY rank DESC
    LIMIT 5
  `)
  console.log(`  "paracetamol" matched ${searchCheck.length} medicines:`)
  for (const row of searchCheck) {
    console.log(`    ${row.name}`)
  }

  const blocked = await prisma.medicine.count({ where: { schedule: 'X', isActive: true } })
  console.log(`\nCompliance check: ${blocked} active Schedule X medicines (must be 0)`)

  console.log(`\nDone. Every account signs in with the password: ${DEV_PASSWORD}`)
  console.log('Full account list: docs/DEV-ACCOUNTS.md')
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
