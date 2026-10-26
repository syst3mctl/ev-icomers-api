# ev-icomers-api

icomers ონლაინ მაღაზიის backend: **NestJS** (modular monolith), **PostgreSQL** + **Prisma**.
ერთი კოდბაზიდან ეშვება ორი პროცესი: **API** (`src/main.ts`, REST + SSE) და **Worker** (`src/worker.ts`, ფონური სამუშაო).

დოკუმენტაცია (არქიტექტურა, API, ბაზა, deploy): დოკუმენტაციის რეპო და საიტი. სტატუსი და გეგმა: იქვე, `PROJECT.md`.

## რა უნდა იყოს დაყენებული

- Node.js 24 LTS
- pnpm: `corepack enable`
- Docker Desktop

## პირველი გაშვება

```bash
cp .env.example .env
docker compose up -d          # Postgres, NATS, MinIO, Mailpit
pnpm install                  # აგენერირებს Prisma client-საც

# ბაზა (მხოლოდ პირველად — იხ. „ბაზა“ ქვემოთ)
pnpm db:migrate --name init
pnpm prisma migrate dev --create-only --name inventory_checks
#   → ახლად შექმნილ prisma/migrations/*_inventory_checks/migration.sql-ში ჩასვი prisma/sql/inventory_checks.sql-ის შიგთავსი
pnpm db:migrate
pnpm db:seed                  # სატესტო კატეგორიები, დამტენები, პროდუქტები

pnpm start:dev                # API: http://localhost:4000
```

- Swagger UI: http://localhost:4000/docs
- OpenAPI JSON: http://localhost:4000/docs-json
- Health: http://localhost:4000/health/live, http://localhost:4000/health/ready
- Prisma Studio (ბაზის დათვალიერება): `pnpm db:studio`
- Worker: `pnpm start:worker`

## ბრძანებები

| ბრძანება | რას აკეთებს |
|---|---|
| `pnpm start:dev` | API, ცვლილებებზე თავად გადაიტვირთება |
| `pnpm start:worker` | Worker |
| `pnpm lint` / `pnpm typecheck` | კოდის შემოწმება |
| `pnpm test` / `pnpm test:e2e` | unit / e2e ტესტები (Vitest) |
| `pnpm db:migrate --name <სახელი>` | სქემის ცვლილებიდან ახალი მიგრაცია + გამოყენება |
| `pnpm db:seed` | სატესტო მონაცემები |
| `pnpm openapi:export` | `openapi.json`-ის განახლება (ფრონტების ტიპებისთვის) |

## ბაზა

- სქემა: `prisma/schema.prisma`. ცხრილები და ველები `snake_case`; თანხა მთელ რიცხვად, თეთრებში (`*_minor`).
- სქემის შეცვლის შემდეგ: `pnpm db:migrate --name <რა შეიცვალა>` და მიგრაციის ფაილი commit-ში.
- ზოგი შეზღუდვა (მაგ. მარაგი უარყოფითი არ უნდა იყოს) Prisma-ს სქემაში ვერ იწერება. ის ცალკე მიგრაციაშია: `prisma/sql/inventory_checks.sql`.
- Raw SQL-ის საჭიროებისას (თავსებადობის ფილტრი, მარაგის დაჯავშნა): `prisma.$queryRaw` / `prisma.$executeRaw`.

## API-ს წესები

- ყველა endpoint: `/v1/...` (health და docs — ვერსიის გარეშე).
- JSON ველები `snake_case`.
- შეცდომები: `application/problem+json`, მუდმივი `code`-ით. ბიზნეს-შეცდომა: `throw new AppError(409, 'OUT_OF_STOCK', '...')` (`src/common/filters/problem-details.filter.ts`).
- DTO-ები აღიწერება `class-validator`-ით და `@nestjs/swagger`-ის დეკორატორებით, რომ `openapi.json` სრული იყოს.
- API-ს ცვლილების შემდეგ: `pnpm openapi:export` და `openapi.json` commit-ში (CI ამას ამოწმებს).

## სტრუქტურა

```
src/
  main.ts               API
  worker.ts             Worker
  app.module.ts         API-ს მოდულები
  app.setup.ts          საერთო პარამეტრები (ვერსია, ვალიდაცია)
  config/env.ts         env ცვლადები და მათი შემოწმება
  common/               საერთო: შეცდომების ფორმატი
  infra/prisma/         ბაზასთან კავშირი
  modules/              ბიზნეს-მოდულები (health; შემდეგ catalog, compatibility, inventory, ...)
  worker/               Worker-ის მოდულები
  generated/prisma/     Prisma client (გენერირებული, git-ში არ არის)
prisma/
  schema.prisma         ბაზის სქემა
  seed.ts               სატესტო მონაცემები
  sql/                  დამატებითი SQL მიგრაციებისთვის
```

## Deploy (usectl)

ერთი `Dockerfile`, სამი აპი:

| აპი | ტიპი | ბრძანება |
|---|---|---|
| `api` | web | ნაგულისხმევი (`node dist/main.js`), port 4000 |
| `worker` | worker | `node dist/worker.js` |
| `migrate` | release | `node_modules/.bin/prisma migrate deploy` |

საჭირო env: `DATABASE_URL` (Postgres addon), `NODE_ENV=production`, `SWAGGER_ENABLED` (production-ში `false`), `CORS_ORIGINS`.
