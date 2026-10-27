# ev-icomers-api

icomers ონლაინ მაღაზიის backend: **NestJS** (modular monolith), **PostgreSQL** + **Prisma**.
ერთი კოდბაზიდან ეშვება ორი პროცესი: **API** (`src/main.ts`, REST + SSE) და **Worker** (`src/worker.ts`, ფონური სამუშაო).

დოკუმენტაცია (არქიტექტურა, API, ბაზა, deploy): დოკუმენტაციის რეპო და საიტი. სტატუსი და გეგმა: იქვე, `PROJECT.md`.

## რა უნდა იყოს დაყენებული

- Node.js 24 LTS — რეპოში არის `.nvmrc`, ამიტომ `nvm use` საკმარისია.
  **Prisma 7 არ უშვებს Node 23-ს** (საჭიროა 20.19+ / 22.12+ / 24+), ამიტომ `node -v` წინასწარ შეამოწმე.
- pnpm: `corepack enable`
- Docker Desktop

## პირველი გაშვება

```bash
nvm use                       # Node 24
cp .env.example .env
docker compose up -d          # Postgres, NATS, Mailpit (MinIO დროებით გათიშულია — იხ. „ცნობილი პრობლემები“)
pnpm install                  # აგენერირებს Prisma client-საც

pnpm db:migrate               # მიგრაციები უკვე რეპოშია — მხოლოდ გამოყენება
pnpm db:seed                  # სატესტო კატეგორიები, დამტენები, პროდუქტები

pnpm start:dev                # API: http://localhost:4000
```

- Swagger UI: http://localhost:4000/docs
- OpenAPI JSON: http://localhost:4000/docs-json
- Health: http://localhost:4000/health/live, http://localhost:4000/health/ready
- Prisma Studio (ბაზის დათვალიერება): `pnpm db:studio`
- Worker: `pnpm start:worker`

სწრაფი შემოწმება:

```bash
curl -s localhost:4000/health/ready                  # {"status":"ok"}
curl -s localhost:4000/v1/admin/categories           # seed-ის კატეგორიები
```

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

## ადმინის endpoint-ები და ავტორიზაცია

`/v1/admin/*` დაცულია `AdminGuard`-ით (`src/modules/auth/admin.guard.ts`), როლები `@Roles()`-ით.

⚠️ **JWT-ის შემოწმება JWKS-ით ჯერ არ არის დაწერილი** — Identity-ის issuer და client-ები ჯერ არ გვაქვს
(`PROJECT.md` §3 → ღია კითხვა `identity-oidc`). სანამ ეს გაირკვევა, guard **დახურულია**:

| `NODE_ENV` | ქცევა |
|---|---|
| `development` | როლები მოდის `DEV_ADMIN_ROLES`-იდან (`.env`) ან `X-Dev-Roles` header-იდან. ტოკენი არ მოწმდება |
| ყველა სხვა (`test`, `production`) | ყოველთვის `503 AUTH_NOT_CONFIGURED` |

ასე staging/production-ზე ადმინის endpoint-ები შემთხვევით ღია ვერ დარჩება.

```bash
# ლოკალურად: .env-ში DEV_ADMIN_ROLES=admin
curl -s localhost:4000/v1/admin/products

# სხვა როლის შემოწმება კონკრეტულ მოთხოვნაზე
curl -s -H 'X-Dev-Roles: warehouse' localhost:4000/v1/admin/products   # 403 FORBIDDEN
```

როცა Identity გაიხსნება: `admin.guard.ts`-ში ემატება ტოკენის ვერიფიკაცია (`jose` + JWKS) და
`roles` claim-ის წაკითხვა; `@Roles()`-ის ლოგიკა და controller-ები უცვლელი რჩება.

### რა არსებობს ახლა

| endpoint-ების ჯგუფი | როლები (`src/modules/auth/roles.ts`) |
|---|---|
| `/v1/admin/categories`, `/v1/admin/products` | `CATALOG_EDITOR_ROLES`: `content_editor`, `manager`, `admin` |
| `/v1/admin/charger-brands`, `/v1/admin/charger-models`, `/v1/admin/products/{id}/compatibility` | იგივე |
| `/v1/admin/inventory/...` | `INVENTORY_ROLES`: `warehouse`, `manager`, `admin` |

სრული სია: Swagger `/docs` ან `openapi.json`.

**მარაგი.** რაოდენობა პირდაპირ არ იწერება — მხოლოდ ცვლილებით
(`POST /v1/admin/inventory/{product_id}/movements`), რომ ყველა ნაბიჯი `stock_movements`-ში
დარჩეს ავტორითა და მიზეზით. `on_hand` და ისტორიის ჩანაწერი ერთ ტრანზაქციაშია; თუ
შედეგად `on_hand` დაკავებულზე (`reserved`) ნაკლები გამოდის — `409 INSUFFICIENT_STOCK` და
არაფერი იცვლება. `reserved`-ს ადმინი არ ცვლის: ის checkout-ის დაჯავშნაა
(`docs/06-order-flow.md`).

## ცნობილი პრობლემები (ლოკალური გარემო)

| პრობლემა | მიზეზი და გამოსავალი |
|---|---|
| `pnpm install` ვარდება: *„Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+“* | სისტემაში Homebrew-ის Node 23-ია. `nvm use` (რეპოში `.nvmrc`), ან სამუდამოდ `nvm alias default 24` |
| `docker compose up -d` ვარდება: *„pull access denied for minio/minio“* | MinIO-ს community image-ები აღარ არის თავისუფლად ჩამოსატვირთი: `minio/minio` Docker Hub-ზე აღარ არსებობს, quay.io-ზე ავტორიზაციას ითხოვს. სერვისი დროებით კომენტარშია `docker-compose.yml`-ში. S3 ეტაპ 1-იდან დაგვჭირდება — მაშინ შეირჩევა ჩანაცვლება (localstack / seaweedfs / garage / adobe-s3mock) |
| macOS: *„You can't open the application Docker because it is not responding“* | Docker Desktop-ის GUI მოკვდა, backend პროცესები მიტოვებული დარჩა. გაასუფთავე და ხელახლა გაუშვი: `pkill -f 'Docker.app/Contents/MacOS'` → `open -a Docker` |
| ტესტებში ადმინის endpoint-ი 503-ს აბრუნებს | ასე უნდა იყოს: e2e `NODE_ENV=test`-ზე გარბის. endpoint-ის ტესტირებისას guard გადაფარე `.overrideGuard(AdminGuard)`-ით (**არა** `overrideProvider`-ით — guard-ზე ის არ მოქმედებს). მაგალითი: `test/admin-catalog.e2e-spec.ts` |

## სტრუქტურა

```
src/
  main.ts               API
  worker.ts             Worker
  app.module.ts         API-ს მოდულები
  app.setup.ts          საერთო პარამეტრები (ვერსია, ვალიდაცია)
  config/env.ts         env ცვლადები და მათი შემოწმება
  common/               საერთო: შეცდომების ფორმატი, pagination, ენები
  infra/prisma/         ბაზასთან კავშირი და Prisma-ს შეცდომების ამოცნობა
  modules/
    health/             /health/live, /health/ready
    auth/               AdminGuard, @Roles() (JWT ჯერ არ არის — იხ. ზემოთ)
    catalog/            კატეგორიები და პროდუქტები (ჯერ მხოლოდ /v1/admin/...)
    compatibility/      დამტენის ბრენდები/მოდელები და კავშირი პროდუქტებთან
    inventory/          მარაგი: რაოდენობები და ცვლილებების ისტორია
    ...                 შემდეგ: cart, orders, checkout, payments, ...
  worker/               Worker-ის მოდულები
  generated/prisma/     Prisma client (გენერირებული, git-ში არ არის)
prisma/
  schema.prisma         ბაზის სქემა
  migrations/           მიგრაციები (commit-ში)
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
