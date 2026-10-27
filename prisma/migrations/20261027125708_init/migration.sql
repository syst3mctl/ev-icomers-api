-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "category_id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("category_id","locale")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "status" "product_status" NOT NULL DEFAULT 'DRAFT',
    "price_minor" INTEGER NOT NULL,
    "compare_at_price_minor" INTEGER,
    "vat_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "oem_part_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "is_universal" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "weight_g" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "product_id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("product_id","locale")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "key" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "unit" TEXT,
    "is_filterable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "charger_brands" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "charger_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charger_models" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" TEXT,
    "power_kw" DECIMAL(6,2),
    "image_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "charger_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_compatibility" (
    "product_id" UUID NOT NULL,
    "charger_model_id" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "product_compatibility_pkey" PRIMARY KEY ("product_id","charger_model_id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "product_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "order_id" UUID,
    "reason" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "charger_brands_slug_key" ON "charger_brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "charger_models_brand_id_slug_key" ON "charger_models"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "product_compatibility_charger_model_id_product_id_idx" ON "product_compatibility"("charger_model_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_reservations_status_expires_at_idx" ON "stock_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_idx" ON "stock_reservations"("order_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charger_models" ADD CONSTRAINT "charger_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "charger_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_charger_model_id_fkey" FOREIGN KEY ("charger_model_id") REFERENCES "charger_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
