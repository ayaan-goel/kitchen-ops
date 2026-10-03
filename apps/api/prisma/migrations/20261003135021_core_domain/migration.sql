-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'COLD');

-- CreateEnum
CREATE TYPE "TierDerivation" AS ENUM ('MANUAL', 'FROM_COST', 'FROM_TIER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'UPDATED', 'PLACED', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'KITCHEN_STARTED', 'KITCHEN_READY', 'KITCHEN_FORCE_COMPLETED', 'DELIVERY_CHANGED', 'DROP_ASSIGNED', 'DRIVER_ASSIGNED', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICED', 'ADJUSTMENT_ADDED');

-- CreateEnum
CREATE TYPE "DropStage" AS ENUM ('PENDING', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "CutoffTrigger" AS ENUM ('SCHEDULED', 'ON_DEMAND', 'MANUAL', 'CLOSE_EARLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('CANCELLED_AFTER_INVOICE', 'REJECTED_AFTER_INVOICE', 'SHORT_DELIVERY', 'PRICE_CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('DELIVERY_PHOTO', 'DISH_IMAGE');

-- CreateTable
CREATE TABLE "Allergen" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Allergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryTag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortionSize" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PortionSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PackagingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "temperature" "Temperature" NOT NULL,
    "costCents" INTEGER NOT NULL,
    "stationId" UUID,
    "minOrderQty" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishAllergen" (
    "dishId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "DishAllergen_pkey" PRIMARY KEY ("dishId","allergenId")
);

-- CreateTable
CREATE TABLE "DishDietaryTag" (
    "dishId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "DishDietaryTag_pkey" PRIMARY KEY ("dishId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "costCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionAllergen" (
    "optionId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "OptionAllergen_pkey" PRIMARY KEY ("optionId","allergenId")
);

-- CreateTable
CREATE TABLE "OptionDietaryTag" (
    "optionId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "OptionDietaryTag_pkey" PRIMARY KEY ("optionId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "usesPortions" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroupItem" (
    "groupId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroupItem_pkey" PRIMARY KEY ("groupId","optionId")
);

-- CreateTable
CREATE TABLE "OptionGroupPortionSize" (
    "groupId" UUID NOT NULL,
    "portionSizeId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroupPortionSize_pkey" PRIMARY KEY ("groupId","portionSizeId")
);

-- CreateTable
CREATE TABLE "OptionPortion" (
    "optionId" UUID NOT NULL,
    "portionSizeId" UUID NOT NULL,
    "extraCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionPortion_pkey" PRIMARY KEY ("optionId","portionSizeId")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "derivation" "TierDerivation" NOT NULL DEFAULT 'MANUAL',
    "baseTierId" UUID,
    "multiplierBps" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishPrice" (
    "tierId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DishPrice_pkey" PRIMARY KEY ("tierId","dishId")
);

-- CreateTable
CREATE TABLE "OptionPrice" (
    "tierId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OptionPrice_pkey" PRIMARY KEY ("tierId","optionId")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHiddenCategory" (
    "companyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "CompanyHiddenCategory_pkey" PRIMARY KEY ("companyId","categoryId")
);

-- CreateTable
CREATE TABLE "CompanyHiddenMenuItem" (
    "companyId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,

    CONSTRAINT "CompanyHiddenMenuItem_pkey" PRIMARY KEY ("companyId","menuItemId")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priceTierId" UUID,
    "ownerEmployeeId" UUID,
    "defaultAddressId" UUID,
    "billingContactName" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "billingPhone" TEXT,
    "billingAddress" TEXT NOT NULL DEFAULT '',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "defaultDeliveryTime" INTEGER NOT NULL,
    "dispatchLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultPackagingTypeId" UUID NOT NULL,
    "driverInstructions" TEXT NOT NULL DEFAULT '',
    "defaultDriverId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "canChooseAddress" BOOLEAN NOT NULL DEFAULT false,
    "canChangeDeliveryTime" BOOLEAN NOT NULL DEFAULT false,
    "canChangePackaging" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAllergen" (
    "employeeId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "EmployeeAllergen_pkey" PRIMARY KEY ("employeeId","allergenId")
);

-- CreateTable
CREATE TABLE "EmployeeDietaryPreference" (
    "employeeId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "EmployeeDietaryPreference_pkey" PRIMARY KEY ("employeeId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kitchenWorkingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "cutoffTime" INTEGER NOT NULL DEFAULT 960,
    "cutoffDaysBefore" INTEGER NOT NULL DEFAULT 2,
    "kitchenBufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "atRiskMinutes" INTEGER NOT NULL DEFAULT 30,
    "onTimeGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "deliveryWindowStart" INTEGER NOT NULL DEFAULT 420,
    "deliveryWindowEnd" INTEGER NOT NULL DEFAULT 1260,
    "defaultPriceTierId" UUID NOT NULL,
    "publicEmailDomains" TEXT[],
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenHoliday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "KitchenHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutoffRun" (
    "id" UUID NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "firstRunAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runCount" INTEGER NOT NULL DEFAULT 1,
    "trigger" "CutoffTrigger" NOT NULL,
    "triggeredById" UUID,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CutoffRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "priceTierId" UUID NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "deliveryTime" INTEGER NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "addressId" UUID NOT NULL,
    "addressSnapshot" TEXT NOT NULL,
    "packagingTypeId" UUID NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "dispatchLeadMinutes" INTEGER NOT NULL,
    "plannedDispatchReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedKitchenReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "placedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "statusReason" TEXT,
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenReadyAt" TIMESTAMPTZ(3),
    "kitchenForced" BOOLEAN NOT NULL DEFAULT false,
    "dropId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dishName" TEXT NOT NULL,
    "dishSku" TEXT NOT NULL,
    "dishTemperature" "Temperature" NOT NULL,
    "dishUnitPriceCents" INTEGER NOT NULL,
    "dishUnitCostCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pricedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineCombination" (
    "id" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenStartedById" UUID,
    "kitchenDoneAt" TIMESTAMPTZ(3),
    "kitchenDoneById" UUID,

    CONSTRAINT "OrderLineCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineSelection" (
    "id" UUID NOT NULL,
    "combinationId" UUID NOT NULL,
    "optionGroupId" UUID,
    "optionId" UUID NOT NULL,
    "portionSizeId" UUID,
    "groupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "portionName" TEXT,
    "optionUnitPriceCents" INTEGER NOT NULL,
    "portionExtraCents" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL,

    CONSTRAINT "OrderLineSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "data" JSONB,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" UUID NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "companyId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "deliveryTime" INTEGER NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "stage" "DropStage" NOT NULL DEFAULT 'PENDING',
    "driverId" UUID,
    "dispatchReadyAt" TIMESTAMPTZ(3),
    "outForDeliveryAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "deliveredOnTime" BOOLEAN,
    "deliveredById" UUID,
    "deliveryNote" TEXT,
    "photoId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATE,
    "periodEnd" DATE,
    "totalCents" INTEGER NOT NULL,
    "billingSnapshot" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMPTZ(3),
    "paymentReference" TEXT,
    "createdById" UUID,
    "paidById" UUID,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "orderId" UUID,
    "adjustmentId" UUID,
    "description" TEXT NOT NULL,
    "deliveryDate" DATE,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAdjustment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoDay" (
    "date" DATE NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemoDay_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Allergen_name_key" ON "Allergen"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DietaryTag_name_key" ON "DietaryTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_name_key" ON "KitchenStation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortionSize_name_key" ON "PortionSize"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingType_name_key" ON "PackagingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_sku_key" ON "Dish"("sku");

-- CreateIndex
CREATE INDEX "Dish_isActive_idx" ON "Dish"("isActive");

-- CreateIndex
CREATE INDEX "Dish_stationId_idx" ON "Dish"("stationId");

-- CreateIndex
CREATE INDEX "DishAllergen_allergenId_idx" ON "DishAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "DishDietaryTag_dietaryTagId_idx" ON "DishDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "Option_name_key" ON "Option"("name");

-- CreateIndex
CREATE INDEX "OptionAllergen_allergenId_idx" ON "OptionAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "OptionDietaryTag_dietaryTagId_idx" ON "OptionDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE INDEX "OptionGroup_dishId_sortOrder_idx" ON "OptionGroup"("dishId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroup_dishId_name_key" ON "OptionGroup"("dishId", "name");

-- CreateIndex
CREATE INDEX "OptionGroupItem_optionId_idx" ON "OptionGroupItem"("optionId");

-- CreateIndex
CREATE INDEX "OptionGroupPortionSize_portionSizeId_idx" ON "OptionGroupPortionSize"("portionSizeId");

-- CreateIndex
CREATE INDEX "OptionPortion_portionSizeId_idx" ON "OptionPortion"("portionSizeId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_name_key" ON "PriceTier"("name");

-- CreateIndex
CREATE INDEX "PriceTier_baseTierId_idx" ON "PriceTier"("baseTierId");

-- CreateIndex
CREATE INDEX "DishPrice_dishId_idx" ON "DishPrice"("dishId");

-- CreateIndex
CREATE INDEX "OptionPrice_optionId_idx" ON "OptionPrice"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_slug_key" ON "MenuCategory"("slug");

-- CreateIndex
CREATE INDEX "MenuCategory_sortOrder_idx" ON "MenuCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_dishId_idx" ON "MenuItem"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_categoryId_dishId_key" ON "MenuItem"("categoryId", "dishId");

-- CreateIndex
CREATE INDEX "CompanyHiddenCategory_categoryId_idx" ON "CompanyHiddenCategory"("categoryId");

-- CreateIndex
CREATE INDEX "CompanyHiddenMenuItem_menuItemId_idx" ON "CompanyHiddenMenuItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerEmployeeId_key" ON "Company"("ownerEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_defaultAddressId_key" ON "Company"("defaultAddressId");

-- CreateIndex
CREATE INDEX "Company_priceTierId_idx" ON "Company"("priceTierId");

-- CreateIndex
CREATE INDEX "Company_defaultDriverId_idx" ON "Company"("defaultDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_domain_key" ON "CompanyDomain"("domain");

-- CreateIndex
CREATE INDEX "CompanyDomain_companyId_idx" ON "CompanyDomain"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_idx" ON "CompanyAddress"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_companyId_date_key" ON "CompanyHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_companyId_name_idx" ON "Employee"("companyId", "name");

-- CreateIndex
CREATE INDEX "EmployeeAllergen_allergenId_idx" ON "EmployeeAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "EmployeeDietaryPreference_dietaryTagId_idx" ON "EmployeeDietaryPreference"("dietaryTagId");

-- CreateIndex
CREATE INDEX "PlatformSettings_defaultPriceTierId_idx" ON "PlatformSettings"("defaultPriceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenHoliday_date_key" ON "KitchenHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CutoffRun_deliveryDate_key" ON "CutoffRun"("deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_status_deliveryDate_idx" ON "Order"("status", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_companyId_deliveryDate_idx" ON "Order"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_employeeId_deliveryDate_idx" ON "Order"("employeeId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_dropId_idx" ON "Order"("dropId");

-- CreateIndex
CREATE INDEX "OrderLine_dishId_idx" ON "OrderLine"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_dishId_key" ON "OrderLine"("orderId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineCombination_orderLineId_signature_key" ON "OrderLineCombination"("orderLineId", "signature");

-- CreateIndex
CREATE INDEX "OrderLineSelection_combinationId_idx" ON "OrderLineSelection"("combinationId");

-- CreateIndex
CREATE INDEX "OrderLineSelection_optionId_idx" ON "OrderLineSelection"("optionId");

-- CreateIndex
CREATE INDEX "OrderLineSelection_optionGroupId_idx" ON "OrderLineSelection"("optionGroupId");

-- CreateIndex
CREATE INDEX "OrderLineSelection_portionSizeId_idx" ON "OrderLineSelection"("portionSizeId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_at_idx" ON "OrderEvent"("orderId", "at");

-- CreateIndex
CREATE INDEX "OrderEvent_actorId_idx" ON "OrderEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_photoId_key" ON "Drop"("photoId");

-- CreateIndex
CREATE INDEX "Drop_deliveryDate_driverId_idx" ON "Drop"("deliveryDate", "driverId");

-- CreateIndex
CREATE INDEX "Drop_deliveryDate_stage_idx" ON "Drop"("deliveryDate", "stage");

-- CreateIndex
CREATE INDEX "Drop_companyId_idx" ON "Drop"("companyId");

-- CreateIndex
CREATE INDEX "Drop_addressId_idx" ON "Drop"("addressId");

-- CreateIndex
CREATE INDEX "Drop_driverId_idx" ON "Drop"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_deliveryDate_companyId_addressId_deliveryTime_key" ON "Drop"("deliveryDate", "companyId", "addressId", "deliveryTime");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_orderId_key" ON "InvoiceLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_adjustmentId_key" ON "InvoiceLine"("adjustmentId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingAdjustment_companyId_idx" ON "BillingAdjustment"("companyId");

-- CreateIndex
CREATE INDEX "BillingAdjustment_orderId_idx" ON "BillingAdjustment"("orderId");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupItem" ADD CONSTRAINT "OptionGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupItem" ADD CONSTRAINT "OptionGroupItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupPortionSize" ADD CONSTRAINT "OptionGroupPortionSize_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupPortionSize" ADD CONSTRAINT "OptionGroupPortionSize_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_baseTierId_fkey" FOREIGN KEY ("baseTierId") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultAddressId_fkey" FOREIGN KEY ("defaultAddressId") REFERENCES "CompanyAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultPackagingTypeId_fkey" FOREIGN KEY ("defaultPackagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergen" ADD CONSTRAINT "EmployeeAllergen_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergen" ADD CONSTRAINT "EmployeeAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryPreference" ADD CONSTRAINT "EmployeeDietaryPreference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryPreference" ADD CONSTRAINT "EmployeeDietaryPreference_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_defaultPriceTierId_fkey" FOREIGN KEY ("defaultPriceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OrderLineCombination_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineSelection" ADD CONSTRAINT "OrderLineSelection_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "OrderLineCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineSelection" ADD CONSTRAINT "OrderLineSelection_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineSelection" ADD CONSTRAINT "OrderLineSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineSelection" ADD CONSTRAINT "OrderLineSelection_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "BillingAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Hand-written CHECK constraints (docs/DATABASE_MODELS.md §7) ─────────────

-- Singleton settings
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_singleton" CHECK ("id" = 1);
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_ranges" CHECK (
  "cutoffTime" BETWEEN 0 AND 1439 AND "cutoffDaysBefore" BETWEEN 0 AND 14
  AND "kitchenBufferMinutes" BETWEEN 0 AND 240 AND "atRiskMinutes" BETWEEN 0 AND 240
  AND "onTimeGraceMinutes" BETWEEN 0 AND 120
  AND "deliveryWindowStart" BETWEEN 0 AND 1439 AND "deliveryWindowEnd" BETWEEN 0 AND 1439
  AND "deliveryWindowStart" < "deliveryWindowEnd");

-- Money and quantity sanity
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_cost_nonneg" CHECK ("costCents" >= 0);
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_moq_positive" CHECK ("minOrderQty" IS NULL OR "minOrderQty" >= 1);
ALTER TABLE "Option" ADD CONSTRAINT "Option_cost_nonneg" CHECK ("costCents" >= 0);
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_positive" CHECK ("priceCents" > 0);
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_nonneg" CHECK ("priceCents" >= 0);
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_extra_nonneg" CHECK ("extraCents" >= 0);
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_max_positive" CHECK ("maxSelections" >= 1);
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_nonneg" CHECK ("totalCents" >= 0);
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_qty_positive" CHECK ("quantity" >= 1);
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OLC_qty_positive" CHECK ("quantity" >= 1);
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OLC_total_matches" CHECK ("totalCents" = "unitPriceCents" * "quantity");

-- Kitchen unit integrity: done implies started, and not before it
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OLC_done_implies_started" CHECK (
  "kitchenDoneAt" IS NULL OR ("kitchenStartedAt" IS NOT NULL AND "kitchenDoneAt" >= "kitchenStartedAt"));

-- Times of day
ALTER TABLE "Order" ADD CONSTRAINT "Order_time_range" CHECK ("deliveryTime" BETWEEN 0 AND 1439);
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_time_range" CHECK ("deliveryTime" BETWEEN 0 AND 1439);
ALTER TABLE "Company" ADD CONSTRAINT "Company_time_range" CHECK (
  "defaultDeliveryTime" BETWEEN 0 AND 1439 AND "dispatchLeadMinutes" BETWEEN 0 AND 600);

-- Tier derivation shape (cycles beyond self are rejected by the service)
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_derivation_shape" CHECK (
     ("derivation" = 'MANUAL'    AND "baseTierId" IS NULL     AND "multiplierBps" IS NULL)
  OR ("derivation" = 'FROM_COST' AND "baseTierId" IS NULL     AND "multiplierBps" > 0)
  OR ("derivation" = 'FROM_TIER' AND "baseTierId" IS NOT NULL AND "baseTierId" <> "id" AND "multiplierBps" > 0));

-- Drop stage consistency
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_stage_consistency" CHECK (
     "stage" = 'PENDING'
  OR ("stage" = 'DISPATCH_READY'   AND "dispatchReadyAt" IS NOT NULL)
  OR ("stage" = 'OUT_FOR_DELIVERY' AND "outForDeliveryAt" IS NOT NULL AND "driverId" IS NOT NULL)
  OR ("stage" = 'DELIVERED'        AND "deliveredAt" IS NOT NULL AND "deliveredOnTime" IS NOT NULL));

-- An invoice line bills exactly one thing
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_exactly_one_target" CHECK (num_nonnulls("orderId", "adjustmentId") = 1);

-- Normalised identifiers
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_email_lower" CHECK ("email" = lower("email"));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_email_lower" CHECK ("email" = lower("email"));
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_lower" CHECK ("domain" = lower("domain"));