import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * სატესტო (demo) მონაცემები: 5 კატეგორია, დამტენის 2 ბრენდი / 3 მოდელი, 13 პროდუქტი მარაგით
 * (ერთი — მარაგის გარეშე, ერთი — ფასდაკლებით). სურათები არ ემატება — ადმინკიდან იტვირთება.
 * იყენებს `prisma/seed.ts` (ლოკალურად, `pnpm db:seed`) და `seed-demo.ts` (staging, Docker-ში).
 *
 * განმეორებით გაშვება უსაფრთხოა: კატეგორიები, ბრენდები და მოდელები — upsert slug-ით
 * (არსებულს არ ცვლის), პროდუქტი — გამოტოვდება, თუ ამ SKU-ით უკვე არსებობს.
 */
export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  // --- კატეგორიები ---
  const categories = [
    { slug: 'cables', ka: 'კაბელები', en: 'Cables' },
    { slug: 'connectors', ka: 'კონექტორები', en: 'Connectors' },
    { slug: 'accessories', ka: 'აქსესუარები', en: 'Accessories' },
    { slug: 'adapters', ka: 'ადაპტერები', en: 'Adapters' },
    {
      slug: 'protection',
      ka: 'დაცვა და ელექტროობა',
      en: 'Protection & electrical',
    },
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
    {
      sku: 'CBL-T2-32-10',
      slug: 'type2-cable-32a-10m',
      category: 'cables',
      price_minor: 44900,
      ka: 'Type 2 კაბელი 32A, 10მ',
      en: 'Type 2 cable 32A, 10m',
      attributes: { connector: 'Type 2', current_a: 32, length_m: 10 },
      fits: ['wallbox/pulsar-plus', 'abb/terra-ac'],
      is_universal: false,
      on_hand: 6,
    },
    {
      sku: 'CBL-T2-16-5',
      slug: 'type2-cable-16a-5m',
      category: 'cables',
      price_minor: 24900,
      compare_at_price_minor: 27900,
      ka: 'Type 2 კაბელი 16A, 5მ',
      en: 'Type 2 cable 16A, 5m',
      attributes: { connector: 'Type 2', current_a: 16, length_m: 5 },
      fits: [],
      is_universal: true,
      on_hand: 20,
    },
    {
      sku: 'CBL-T1-T2-32-5',
      slug: 'type1-to-type2-cable-32a-5m',
      category: 'cables',
      price_minor: 35900,
      ka: 'Type 1 → Type 2 კაბელი 32A, 5მ',
      en: 'Type 1 to Type 2 cable 32A, 5m',
      attributes: { connector: 'Type 1 / Type 2', current_a: 32, length_m: 5 },
      fits: [],
      is_universal: false,
      on_hand: 4,
    },
    {
      sku: 'ADP-T2-SCHUKO',
      slug: 'type2-to-schuko-adapter',
      category: 'adapters',
      price_minor: 18900,
      ka: 'Type 2 → Schuko ადაპტერი',
      en: 'Type 2 to Schuko adapter',
      attributes: { connector: 'Type 2' },
      fits: [],
      is_universal: true,
      on_hand: 8,
    },
    {
      sku: 'ADP-T1-T2',
      slug: 'type1-to-type2-adapter',
      category: 'adapters',
      price_minor: 15900,
      ka: 'Type 1 → Type 2 ადაპტერი',
      en: 'Type 1 to Type 2 adapter',
      attributes: { connector: 'Type 1 / Type 2' },
      fits: [],
      is_universal: true,
      on_hand: 0,
    },
    {
      sku: 'CON-T2-M',
      slug: 'type2-plug-male',
      category: 'connectors',
      price_minor: 9500,
      ka: 'Type 2 შტეკერი',
      en: 'Type 2 plug',
      attributes: { connector: 'Type 2' },
      fits: ['wallbox/commander-2'],
      is_universal: false,
      on_hand: 15,
    },
    {
      sku: 'PRT-RCD-A-40',
      slug: 'rcd-type-a-40a',
      category: 'protection',
      price_minor: 12900,
      ka: 'დიფერენციალური ავტომატი Type A, 40A',
      en: 'RCD Type A, 40A',
      attributes: { current_a: 40 },
      fits: [],
      is_universal: true,
      on_hand: 10,
    },
    {
      sku: 'PRT-SPD-T2',
      slug: 'surge-protector-type-2',
      category: 'protection',
      price_minor: 16500,
      ka: 'ძაბვის ნახტომისგან დამცავი',
      en: 'Surge protector, Type 2',
      attributes: {},
      fits: [],
      is_universal: true,
      on_hand: 3,
    },
    {
      sku: 'ACC-WALL-MOUNT',
      slug: 'charger-wall-mount',
      category: 'accessories',
      price_minor: 6900,
      ka: 'დამტენის კედლის სამაგრი',
      en: 'Charger wall mount',
      attributes: {},
      fits: ['wallbox/pulsar-plus'],
      is_universal: false,
      on_hand: 12,
    },
    {
      sku: 'ACC-COVER-T2',
      slug: 'type2-socket-cover',
      category: 'accessories',
      price_minor: 2500,
      ka: 'Type 2 როზეტის თავსახური',
      en: 'Type 2 socket cover',
      attributes: {},
      fits: [],
      is_universal: true,
      on_hand: 50,
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
        compare_at_price_minor: p.compare_at_price_minor ?? null,
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
        movements:
          p.on_hand > 0
            ? {
                create: {
                  type: 'RECEIPT',
                  quantity: p.on_hand,
                  reason: 'seed',
                },
              }
            : undefined,
      },
    });
  }
}
