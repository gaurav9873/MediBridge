-- PostGIS powers the Same-Day delivery radius (ST_DWithin over addresses.location).
-- pg_trgm backs fuzzy medicine-name matching for typo-tolerant search.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RETAILER', 'DISTRIBUTOR', 'ADMIN', 'DELIVERY');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DRUG_LICENSE', 'GST_CERTIFICATE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DrugSchedule" AS ENUM ('NONE', 'H', 'H1', 'X');

-- CreateEnum
CREATE TYPE "MedicineForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'OINTMENT', 'CREAM', 'DROPS', 'POWDER', 'INHALER', 'SPRAY', 'GEL', 'SACHET', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleUnit" AS ENUM ('STRIP', 'BOX', 'BOTTLE', 'VIAL', 'TUBE', 'PIECE', 'PACK');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('SAME_DAY', 'NEXT_DAY');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_STARTED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('TOKEN', 'BALANCE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'WALLET', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('RAZORPAY', 'CASHFREE', 'MANUAL');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_PACKED', 'ORDER_DISPATCHED', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'REFUND_INITIATED', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'LICENSE_EXPIRING', 'LICENSE_EXPIRED', 'LOW_STOCK', 'BATCH_EXPIRING', 'NEW_ORDER_RECEIVED', 'SETTLEMENT_PAID');

-- CreateEnum
CREATE TYPE "MedicineRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProblemCategory" AS ENUM ('MISSING_ITEM', 'DAMAGED', 'WRONG_ITEM', 'EXPIRY_TOO_SOON', 'OTHER');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "role" "UserRole" NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "phoneVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessName" VARCHAR(160) NOT NULL,
    "gstNumber" VARCHAR(15) NOT NULL,
    "drugLicenseNumber" VARCHAR(60),
    "licenseExpiresOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessName" VARCHAR(160) NOT NULL,
    "gstNumber" VARCHAR(15) NOT NULL,
    "drugLicenseNumber" VARCHAR(60),
    "licenseExpiresOn" DATE,
    "hubAddressId" UUID,
    "sameDayRadiusKm" INTEGER NOT NULL DEFAULT 25,
    "sameDayCutoffTime" VARCHAR(5) NOT NULL DEFAULT '14:00',
    "deliveryChargePaise" INTEGER NOT NULL DEFAULT 0,
    "freeDeliveryAbovePaise" INTEGER,
    "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "bankAccountHolder" VARCHAR(160),
    "bankAccountNumber" VARCHAR(34),
    "bankIfsc" VARCHAR(11),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" VARCHAR(60) NOT NULL,
    "expiresOn" DATE,
    "fileKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "line1" VARCHAR(200) NOT NULL,
    "line2" VARCHAR(200),
    "city" VARCHAR(80) NOT NULL,
    "state" VARCHAR(80) NOT NULL,
    "pincode" VARCHAR(6) NOT NULL,
    "contactPhone" VARCHAR(10) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    -- Derived from latitude/longitude, so the two can never disagree. Note the
    -- argument order: ST_MakePoint takes (longitude, latitude).
    "location" geography(Point, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
    ) STORED,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" VARCHAR(64),
    "userAgent" VARCHAR(400),
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(120) NOT NULL,
    "composition" VARCHAR(300) NOT NULL,
    "form" "MedicineForm" NOT NULL,
    "strength" VARCHAR(60),
    "packSize" VARCHAR(60),
    "manufacturer" VARCHAR(160),
    "hsnCode" VARCHAR(8) NOT NULL,
    "gstRate" INTEGER NOT NULL DEFAULT 12,
    "schedule" "DrugSchedule" NOT NULL DEFAULT 'NONE',
    "isPrescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    -- Weighted so a brand-name match outranks a composition match: a retailer
    -- typing "Crocin" wants Crocin first, not every paracetamol on the platform.
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("brand", '')), 'B') ||
        setweight(to_tsvector('english', coalesce("composition", '')), 'C') ||
        setweight(to_tsvector('english', coalesce("strength", '')), 'D')
    ) STORED,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_requests" (
    "id" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(120) NOT NULL,
    "composition" VARCHAR(300),
    "form" "MedicineForm",
    "strength" VARCHAR(60),
    "notes" TEXT,
    "status" "MedicineRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "medicineId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "distributorId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchNumber" VARCHAR(60) NOT NULL,
    "expiryDate" DATE NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "sellingPricePaise" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unit" "SaleUnit" NOT NULL DEFAULT 'STRIP',
    "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderId" UUID,
    "cartId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "retailerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addedAtPricePaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_groups" (
    "id" UUID NOT NULL,
    "groupNumber" VARCHAR(24) NOT NULL,
    "retailerId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "tokenPaise" INTEGER NOT NULL,
    "balancePaise" INTEGER NOT NULL,
    "tokenPercent" INTEGER NOT NULL,
    "notes" TEXT,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "orderGroupId" UUID NOT NULL,
    "retailerId" UUID NOT NULL,
    "distributorId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "deliveryMode" "DeliveryMode" NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "deliveryChargePaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "tokenPaise" INTEGER NOT NULL,
    "balancePaise" INTEGER NOT NULL,
    "tokenPercent" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "expectedDeliveryAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "medicineName" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(120) NOT NULL,
    "composition" VARCHAR(300) NOT NULL,
    "batchNumber" VARCHAR(60) NOT NULL,
    "expiryDate" DATE NOT NULL,
    "unit" "SaleUnit" NOT NULL,
    "hsnCode" VARCHAR(8) NOT NULL,
    "gstRate" INTEGER NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "acceptedQuantity" INTEGER,
    "mrpPaise" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "lineSubtotalPaise" INTEGER NOT NULL,
    "lineGstPaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedById" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "orderGroupId" UUID,
    "orderId" UUID,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'RAZORPAY',
    "amountPaise" INTEGER NOT NULL,
    "refundedAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "gatewayOrderId" VARCHAR(120),
    "gatewayPaymentId" VARCHAR(120),
    "gatewaySignature" VARCHAR(255),
    "failureReason" TEXT,
    "rawPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRefundId" VARCHAR(120),
    "initiatedById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "distributorId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "netPayablePaise" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "utrNumber" VARCHAR(40),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "netPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "mode" "DeliveryMode" NOT NULL,
    "deliveryPersonName" VARCHAR(120),
    "deliveryPersonPhone" VARCHAR(10),
    "otpHash" VARCHAR(64),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "cashCollectedPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_reports" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "reportedById" UUID NOT NULL,
    "category" "ProblemCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_accountStatus_idx" ON "users"("role", "accountStatus");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_profiles_userId_key" ON "retailer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_profiles_gstNumber_key" ON "retailer_profiles"("gstNumber");

-- CreateIndex
CREATE INDEX "retailer_profiles_licenseExpiresOn_idx" ON "retailer_profiles"("licenseExpiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_profiles_userId_key" ON "distributor_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_profiles_gstNumber_key" ON "distributor_profiles"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_profiles_hubAddressId_key" ON "distributor_profiles"("hubAddressId");

-- CreateIndex
CREATE INDEX "distributor_profiles_isAcceptingOrders_idx" ON "distributor_profiles"("isAcceptingOrders");

-- CreateIndex
CREATE INDEX "distributor_profiles_licenseExpiresOn_idx" ON "distributor_profiles"("licenseExpiresOn");

-- CreateIndex
CREATE INDEX "documents_verificationStatus_createdAt_idx" ON "documents"("verificationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "documents_userId_type_idx" ON "documents"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "documents_type_number_key" ON "documents"("type", "number");

-- CreateIndex
CREATE INDEX "addresses_userId_isDefault_idx" ON "addresses"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "addresses_pincode_idx" ON "addresses"("pincode");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "medicines_isActive_schedule_idx" ON "medicines"("isActive", "schedule");

-- CreateIndex
CREATE INDEX "medicines_composition_idx" ON "medicines"("composition");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_name_brand_strength_packSize_key" ON "medicines"("name", "brand", "strength", "packSize");

-- CreateIndex
CREATE INDEX "medicine_requests_status_createdAt_idx" ON "medicine_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_items_medicineId_isActive_expiryDate_idx" ON "inventory_items"("medicineId", "isActive", "expiryDate");

-- CreateIndex
CREATE INDEX "inventory_items_distributorId_isActive_idx" ON "inventory_items"("distributorId", "isActive");

-- CreateIndex
CREATE INDEX "inventory_items_expiryDate_idx" ON "inventory_items"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_distributorId_medicineId_batchNumber_key" ON "inventory_items"("distributorId", "medicineId", "batchNumber");

-- CreateIndex
CREATE INDEX "stock_reservations_expiresAt_releasedAt_consumedAt_idx" ON "stock_reservations"("expiresAt", "releasedAt", "consumedAt");

-- CreateIndex
CREATE INDEX "stock_reservations_inventoryItemId_idx" ON "stock_reservations"("inventoryItemId");

-- CreateIndex
CREATE INDEX "stock_reservations_cartId_idx" ON "stock_reservations"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_retailerId_key" ON "carts"("retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cartId_inventoryItemId_key" ON "cart_items"("cartId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "order_groups_groupNumber_key" ON "order_groups"("groupNumber");

-- CreateIndex
CREATE UNIQUE INDEX "order_groups_idempotencyKey_key" ON "order_groups"("idempotencyKey");

-- CreateIndex
CREATE INDEX "order_groups_retailerId_createdAt_idx" ON "order_groups"("retailerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_retailerId_status_createdAt_idx" ON "orders"("retailerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_distributorId_status_createdAt_idx" ON "orders"("distributorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_orderGroupId_idx" ON "orders"("orderGroupId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gatewayPaymentId_key" ON "payments"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "payments_orderGroupId_idx" ON "payments"("orderGroupId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payments_gatewayOrderId_idx" ON "payments"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_gatewayRefundId_key" ON "refunds"("gatewayRefundId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt");

-- CreateIndex
CREATE INDEX "settlements_status_periodEnd_idx" ON "settlements"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_distributorId_periodStart_periodEnd_key" ON "settlements"("distributorId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_settlementId_orderId_key" ON "settlement_items"("settlementId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_orderId_key" ON "deliveries"("orderId");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "problem_reports_status_createdAt_idx" ON "problem_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "problem_reports_orderId_idx" ON "problem_reports"("orderId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_event_createdAt_idx" ON "notifications"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_event_channel_key" ON "notification_preferences"("userId", "event", "channel");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "retailer_profiles" ADD CONSTRAINT "retailer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_hubAddressId_fkey" FOREIGN KEY ("hubAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_requests" ADD CONSTRAINT "medicine_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_requests" ADD CONSTRAINT "medicine_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_requests" ADD CONSTRAINT "medicine_requests_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "order_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Spatial and full-text indexes
--
-- Prisma cannot express GiST or GIN index types, so they are declared here.
-- Both back generated columns, so they stay correct with no application code.
-- ---------------------------------------------------------------------------

-- Same-Day radius: ST_DWithin(distributor_hub.location, retailer.location, radius_m)
CREATE INDEX "addresses_location_gist_idx" ON "addresses" USING GIST ("location");

-- Ranked medicine search over name/brand/composition.
CREATE INDEX "medicines_search_vector_gin_idx" ON "medicines" USING GIN ("searchVector");

-- Typo tolerance: "paracetmol" still finds "Paracetamol".
CREATE INDEX "medicines_name_trgm_idx" ON "medicines" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "medicines_composition_trgm_idx" ON "medicines" USING GIN ("composition" gin_trgm_ops);

-- The hot search path only ever looks at sellable stock, so index just that.
CREATE INDEX "inventory_items_sellable_idx"
    ON "inventory_items" ("medicineId", "expiryDate")
    WHERE "isActive" = true AND "deletedAt" IS NULL AND "quantity" > "reservedQuantity";

-- Sweeping expired stock holds is a frequent background job.
CREATE INDEX "stock_reservations_live_idx"
    ON "stock_reservations" ("expiresAt")
    WHERE "releasedAt" IS NULL AND "consumedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Integrity constraints
--
-- These duplicate rules already enforced in Zod and the service layer. That is
-- deliberate: application code can be bypassed by a migration, a script or a
-- future bug, and money-related invariants are worth defending twice.
-- ---------------------------------------------------------------------------

ALTER TABLE "inventory_items"
    ADD CONSTRAINT "inventory_selling_price_within_mrp"
        CHECK ("sellingPricePaise" <= "mrpPaise"),
    ADD CONSTRAINT "inventory_prices_positive"
        CHECK ("mrpPaise" > 0 AND "sellingPricePaise" > 0),
    ADD CONSTRAINT "inventory_quantities_sane"
        CHECK ("quantity" >= 0 AND "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"),
    ADD CONSTRAINT "inventory_min_order_positive"
        CHECK ("minOrderQuantity" >= 1);

ALTER TABLE "stock_reservations"
    ADD CONSTRAINT "reservation_quantity_positive" CHECK ("quantity" > 0);

-- The token and the balance must always add back to exactly the total. If this
-- ever fails, a retailer has been asked for the wrong amount on delivery.
ALTER TABLE "orders"
    ADD CONSTRAINT "order_token_balance_sums_to_total"
        CHECK ("tokenPaise" + "balancePaise" = "totalPaise"),
    ADD CONSTRAINT "order_amounts_non_negative"
        CHECK ("subtotalPaise" >= 0 AND "gstPaise" >= 0 AND "deliveryChargePaise" >= 0
               AND "totalPaise" >= 0 AND "tokenPaise" >= 0 AND "balancePaise" >= 0),
    ADD CONSTRAINT "order_token_percent_range"
        CHECK ("tokenPercent" BETWEEN 0 AND 100);

ALTER TABLE "order_groups"
    ADD CONSTRAINT "order_group_token_balance_sums_to_total"
        CHECK ("tokenPaise" + "balancePaise" = "totalPaise"),
    ADD CONSTRAINT "order_group_token_percent_range"
        CHECK ("tokenPercent" BETWEEN 0 AND 100);

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_item_quantities_sane"
        CHECK ("orderedQuantity" > 0
               AND ("acceptedQuantity" IS NULL
                    OR ("acceptedQuantity" >= 0 AND "acceptedQuantity" <= "orderedQuantity"))),
    ADD CONSTRAINT "order_item_price_within_mrp"
        CHECK ("unitPricePaise" <= "mrpPaise");

ALTER TABLE "payments"
    ADD CONSTRAINT "payment_amount_positive" CHECK ("amountPaise" > 0),
    ADD CONSTRAINT "payment_refund_within_amount"
        CHECK ("refundedAmountPaise" >= 0 AND "refundedAmountPaise" <= "amountPaise"),
    -- A payment belongs to a group (token) or an order (balance), never both.
    ADD CONSTRAINT "payment_has_exactly_one_parent"
        CHECK (("orderGroupId" IS NULL) <> ("orderId" IS NULL));

ALTER TABLE "refunds"
    ADD CONSTRAINT "refund_amount_positive" CHECK ("amountPaise" > 0);

ALTER TABLE "settlements"
    ADD CONSTRAINT "settlement_amounts_sane"
        CHECK ("grossPaise" >= 0 AND "platformFeePaise" >= 0
               AND "netPayablePaise" = "grossPaise" - "platformFeePaise"),
    ADD CONSTRAINT "settlement_period_ordered" CHECK ("periodEnd" >= "periodStart");

ALTER TABLE "medicines"
    ADD CONSTRAINT "medicine_gst_rate_allowed" CHECK ("gstRate" IN (0, 5, 12, 18));

ALTER TABLE "distributor_profiles"
    ADD CONSTRAINT "distributor_radius_range" CHECK ("sameDayRadiusKm" BETWEEN 1 AND 200),
    ADD CONSTRAINT "distributor_cutoff_format"
        CHECK ("sameDayCutoffTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    ADD CONSTRAINT "distributor_delivery_charge_non_negative"
        CHECK ("deliveryChargePaise" >= 0);

ALTER TABLE "addresses"
    ADD CONSTRAINT "address_coordinates_valid"
        CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);

ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_item_quantity_positive" CHECK ("quantity" > 0);

-- Exactly one default address per user. A partial unique index expresses this
-- far more cheaply than a trigger.
CREATE UNIQUE INDEX "addresses_one_default_per_user"
    ON "addresses" ("userId")
    WHERE "isDefault" = true AND "deletedAt" IS NULL;
