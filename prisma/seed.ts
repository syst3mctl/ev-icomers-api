import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * სატესტო მონაცემები ლოკალური დეველოპმენტისთვის: `pnpm db:seed`.
 * განმეორებით გაშვება უსაფრთხოა (upsert).
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main(): Promise<void> {
  // --- კატეგორიები ---
  const categories = [
    { slug: 'cables', ka: 'კაბელები', en: 'Cables' },
    { slug: 'connectors', ka: 'კონექტორები', en: 'Connectors' },
    { slug: 'accessories', ka: 'აქსესუარები', en: 'Accessories' },
  ];
  const categoryIds: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        sort_order: i,
        translations: {
          create: [
            { locale: 'ka', name: c.ka },
            { locale: 'en', name: c.en },
          ],
        },
      },
    });
    categoryIds[c.slug] = row.id;
  }

  // --- დამტენის ბრენდები და მოდელები ---
  const brands = [
    {
      slug: 'wallbox',
      name: 'Wallbox',
      models: [
        { slug: 'pulsar-plus', name: 'Pulsar Plus', power_kw: 22 },
        { slug: 'commander-2', name: 'Commander 2', power_kw: 22 },
      ],
    },
    {
      slug: 'abb',
      name: 'ABB',
      models: [{ slug: 'terra-ac', name: 'Terra AC', power_kw: 11 }],
    },
  ];
  const modelIds: Record<string, string> = {};
  for (const [i, b] of brands.entries()) {
    const brand = await prisma.chargerBrand.upsert({
      where: { slug: b.slug },
      update: {},
      create: { slug: b.slug, name: b.name, sort_order: i },
    });
    for (const m of b.models) {
      const model = await prisma.chargerModel.upsert({
        where: { brand_id_slug: { brand_id: brand.id, slug: m.slug } },
        update: {},
        create: {
          brand_id: brand.id,
          slug: m.slug,
          name: m.name,
          power_kw: m.power_kw,
        },
      });
      modelIds[`${b.slug}/${m.slug}`] = model.id;
    }
  }

  // --- პროდუქტები ---
  const products = [
    {
      sku: 'CBL-T2-32-5',
      slug: 'type2-cable-32a-5m',
      category: 'cables',
      price_minor: 32900,
      ka: 'Type 2 კაბელი 32A, 5მ',
      en: 'Type 2 cable 32A, 5m',
      attributes: { connector: 'Type 2', current_a: 32, length_m: 5 },
      fits: ['wallbox/pulsar-plus', 'abb/terra-ac'],
      is_universal: false,
      on_hand: 12,
    },
    {
      sku: 'CON-T2-F',
      slug: 'type2-socket-female',
      category: 'connectors',
      price_minor: 8500,
      ka: 'Type 2 როზეტი',
      en: 'Type 2 socket',
      attributes: { connector: 'Type 2' },
      fits: ['wallbox/commander-2'],
      is_universal: false,
      on_hand: 1,
    },
    {
      sku: 'ACC-HOLDER',
      slug: 'cable-holder',
      category: 'accessories',
      price_minor: 4500,
      ka: 'კაბელის სამაგრი',
      en: 'Cable holder',
      attributes: {},
      fits: [],
      is_universal: true,
      on_hand: 30,
    },
  ];
  for (const p of products) {
    const exists = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        sku: p.sku,
        slug: p.slug,
        category_id: categoryIds[p.category],
        status: 'ACTIVE',
        price_minor: p.price_minor,
        attributes: p.attributes,
        is_universal: p.is_universal,
        translations: {
          create: [
            { locale: 'ka', name: p.ka },
            { locale: 'en', name: p.en },
          ],
        },
        compatibility: {
          create: p.fits.map((key) => ({ charger_model_id: modelIds[key] })),
        },
        inventory: { create: { on_hand: p.on_hand } },
        movements: {
          create: {
            type: 'RECEIPT',
            quantity: p.on_hand,
            reason: 'seed',
          },
        },
      },
    });
  }

  console.log('Seed completed');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
