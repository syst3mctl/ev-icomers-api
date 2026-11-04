# ev-icomers-api — Backend

icomers ონლაინ მაღაზიის backend. **მთელი ბიზნეს-ლოგიკა აქ არის**: კატალოგი, თავსებადობა, მარაგი, კალათა, შეკვეთები, გადახდა, ფისკალური ჩეკები, როლების შემოწმება. ბაზაზე წვდომა მხოლოდ ამ რეპოს აქვს.

საერთო აღწერა (რეპოები, კავშირები, API-ს კონტრაქტი, env, წესები) და პროექტის სტატუსი:

@../icomers/SYSTEM.md
@../icomers/PROJECT.md

---

## Stack

| რა | რით |
|---|---|
| Framework | NestJS 12 (ESM, `"type": "module"`, import-ებში `.js` გაფართოება) |
| ბაზა | PostgreSQL 16+, Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| ვალიდაცია | DTO: `class-validator` + `class-transformer`; env: `zod` |
| API-ს აღწერა | `@nestjs/swagger` → `openapi.json` |
| ლოგები | `nestjs-pino` |
| ტესტები | Vitest (unit: `src/**/*.spec.ts`, e2e: `test/**/*.e2e-spec.ts`) |
| Lint / ფორმატი | oxlint, Prettier |
| ფაილები | S3 (`@aws-sdk/client-s3`) staging-ზე / ლოკალური დისკი (`src/infra/storage/`) |
| მოგვიანებით | NATS JetStream (`@nats-io/*`), gRPC (`@grpc/grpc-js`, Buf, ts-proto) |

## ბრძანებები

```bash
nvm use                     # Node 24 — სისტემაში Node 23-ია, Prisma მას არ უშვებს
docker compose up -d        # Postgres, NATS, Mailpit (სურათები ლოკალურად .storage/-ში)
pnpm start:dev              # API → http://localhost:4000 (Swagger: /docs)
pnpm start:worker           # Worker
pnpm lint && pnpm typecheck
pnpm test && pnpm test:e2e
pnpm db:migrate --name <x>  # სქემის ცვლილება → მიგრაცია
pnpm db:seed                # სატესტო მონაცემები
pnpm db:studio              # ბაზის დათვალიერება
pnpm openapi:export         # openapi.json-ის განახლება
```

ცვლილების დასრულებამდე ყოველთვის: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`.

## სტრუქტურა

```
src/
  main.ts                 API (REST + SSE)
  worker.ts               Worker (outbox, NATS consumer-ები, cron) — HTTP-ის გარეშე
  app.module.ts           API-ს მოდულები
  app.setup.ts            საერთო: /v1 ვერსია, ValidationPipe (გამოიყენება main-ში, ტესტებში, openapi export-ში)
  openapi.ts              Swagger / OpenAPI
  config/env.ts           env ცვლადები (zod) — ახალი ცვლადი აქ + .env.example
  common/filters/         problem+json შეცდომები, AppError
  infra/prisma/           PrismaService (global)
  modules/<name>/         ბიზნეს-მოდულები: controller, service, dto/, *.spec.ts
  worker/                 Worker-ის მოდულები
  generated/prisma/       Prisma client (გენერირებული, git-ში არ არის)
prisma/
  schema.prisma           ბაზის სქემა
  migrations/             მიგრაციები (commit-ში)
  seed.ts                 სატესტო მონაცემები
  sql/                    SQL, რომელიც Prisma-ს სქემაში ვერ იწერება (CHECK-ები)
```

დაგეგმილი მოდულები (`docs/02-architecture.md` §3): `auth`, `catalog`, `compatibility`, `inventory`, `customers`, `cart`, `orders`, `checkout`, `payments`, `fiscal`, `admin-events`, `audit`.

## წესები ამ რეპოში

- **მოდულები:** მოდული სხვა მოდულის ცხრილებს პირდაპირ არ ეხება — მხოლოდ მისი service-ით. ასე საჭიროებისას მოდული ცალკე სერვისად გამოიყოფა.
- **Controller-ები თხელია**, ლოგიკა service-შია.
- **DTO-ები** `snake_case` ველებით, `class-validator`-ით და `@ApiProperty`-ით (რომ `openapi.json` სრული იყოს). Response-ებისთვისაც DTO/კლასი, რომ ფრონტმა ზუსტი ტიპი მიიღოს.
- **Route-ები** ავტომატურად `/v1/...`. Admin endpoint-ები: `/v1/admin/...`.
- **შეცდომები:** ბიზნეს-შეცდომა `throw new AppError(status, 'CODE', 'detail')`. `code` მუდმივია და `UPPER_SNAKE_CASE`.
- **ფული:** მხოლოდ `Int`, თეთრებში, ველის სახელი `*_minor`.
- **მარაგი** იცვლება მხოლოდ ტრანზაქციაში (`prisma.$transaction`), შეკვეთასთან ერთად; დაჯავშნა ერთი `UPDATE ... WHERE on_hand - reserved >= qty`-ით (`docs/04-data-model.md` §4).
- **Prisma თუ raw SQL:** CRUD — Prisma; რთული/ცხელი query — `$queryRaw` (მარაგის დაჯავშნა, თავსებადობის ფილტრი, ფასეტების დათვლა). ORM-ის ჩანაცვლება არ იგეგმება — გაზომილია (`docs/01-tech-stack.md` §3). `include`-ის ნაცვლად `select`, სადაც ყველა სვეტი არ გვჭირდება; ახალი ცხელი query — `EXPLAIN ANALYZE`-ით.
- **ბაზის სქემა:** ცხრილები და ველები `snake_case` (Prisma-ს მოდელები PascalCase, `@@map`-ით). ყოველი ცვლილება — მიგრაცია (`pnpm db:migrate --name ...`), ხელით რედაქტირება არა.
- **მიგრაციები და staging-ის ბაზა** (push `master`-ზე → usectl → `start.sh` → `prisma migrate deploy`): ⚠️ ორი წესი, რომ staging-ის ბაზა არ გაფუჭდეს:
  1. **commit-ებული მიგრაცია აღარ იცვლება და არ იშლება.** staging-ს ის უკვე გამოყენებული აქვს — შეცვლილ ფაილზე `migrate deploy` ჩავარდება და API აღარ ადგება. შესწორება — **ახალი** მიგრაციით.
  2. **სახიფათო ცვლილება — ჯერ შემოწმება, მერე push:** სვეტის/ცხრილის წაშლა ან გადარქმევა (მონაცემი იკარგება), ტიპის შეცვლა, სავალდებულო (`NOT NULL`) სვეტი `@default`-ის გარეშე ცხრილში, სადაც უკვე მონაცემებია (მიგრაცია ჩავარდება). ასეთი მიგრაციის SQL (`prisma/migrations/*/migration.sql`) push-მდე წაიკითხე და მომხმარებელს აჩვენე; საჭიროებისას — რამდენიმე ნაბიჯად (ჯერ nullable + შევსება, მერე `NOT NULL`).
  - მიგრაცია staging-ზე გადადის, **მონაცემები — არა**. ლოკალური `pnpm db:migrate` მხოლოდ ლოკალურ ბაზას ეხება; ლოკალური API staging-ის ბაზაზე არ ერთდება (`migrate dev` ბაზის reset-ს ახერხებს).
- **კომპანიის სერვისები** (Billing, Fiscal, Identity) მხოლოდ ინტერფეისის მიღმა (`PaymentGateway`, `FiscalGateway`): gRPC იმპლემენტაცია + mock ტესტებისთვის. proto ფაილები ჯერ არ გვაქვს — ბიზნეს-ლოგიკა ინტერფეისზე იწერება.
- **ავტორიზაცია:** ყველა `/v1/admin/*` — `@UseGuards(AdminGuard)` + `@Roles()` (`src/modules/auth/`). საკუთარი auth (Identity-ის ნაცვლად, PROJECT.md §6 2026-11-04): `admin_users`, JWT ES256 + refresh rotation, httpOnly cookie ადმინკისთვის, OAuth 2.0 `/v1/auth/token` სხვებისთვის. როლები guard-ში ბაზიდან იკითხება. `superadmin` ყველაფერს ფარავს. დეტალები README-ში.
- **ტესტებში guard-ის გადაფარვა:** `.overrideGuard(AdminGuard)`, არა `.overrideProvider()` — guard-ზე ის არ მოქმედებს.
- **ტესტები:** ფული, მარაგი, შეკვეთის სტატუსები და checkout — აუცილებლად. სავალდებულო: 10 პარალელური checkout ბოლო ერთეულზე → წარმატებით მხოლოდ 1.
- **API-ს ცვლილების შემდეგ:** `pnpm openapi:export` და `openapi.json` commit-ში — ამაზეა დამოკიდებული ორივე ფრონტი (`SYSTEM.md` §5).
- **ლოგებში** პერსონალური მონაცემები (ტელეფონი, email, მისამართი, ტოკენი) არ იწერება.

## სად წავიკითხო

| ამოცანა | ფაილი (`../icomers/`) |
|---|---|
| ცხრილები და ურთიერთკავშირები | `docs/04-data-model.md` |
| endpoint-ები, request/response, როლები | `docs/05-api.md` |
| checkout, რეზერვაცია, გადახდა, refund | `docs/06-order-flow.md` |
| Identity, Billing, Fiscal, NATS ივენთები | `docs/03-integrations.md` |
| Outbox, SSE, sync/async წესები | `docs/02-architecture.md` |
| უსაფრთხოება | `docs/11-security.md` |
| Deploy (usectl, Dockerfile, აპები) | `docs/10-deployment.md`, ამ რეპოს `README.md` |

## სტატუსი

- ✅ საფუძველი: NestJS, config, ლოგები, problem+json, health, Swagger, Prisma-ს სქემა (კატალოგი, თავსებადობა, მარაგი), seed, docker-compose, Dockerfile, CI.
- ✅ ლოკალური გარემო გამართულია: მიგრაციები (`init`, `inventory_checks`) რეპოშია და გამოყენებულია, seed გარბის, API ადგება.
- ✅ `catalog` მოდული — ადმინის endpoint-ები: `/v1/admin/categories` (CRUD), `/v1/admin/products` (სია, შექმნა, ცვლილება, არქივი).
- ✅ `auth` მოდული — მომხმარებლები (`/v1/admin/users`, superadmin), login/refresh/logout/password, OAuth 2.0 token endpoint, JWKS, `AdminGuard` + `@Roles()` (README → „ადმინის endpoint-ები და ავტორიზაცია“).
- ✅ `compatibility` მოდული — `/v1/admin/charger-brands` (CRUD), `/v1/admin/charger-models` (CRUD + `{id}/products` მიბმა/მოხსნა), `/v1/admin/products/{id}/compatibility` (GET/PUT).
- ✅ `inventory` მოდული — `/v1/admin/inventory` (სია, `low_stock`), `/v1/admin/inventory/{product_id}` (GET/PATCH ზღვარი), `{product_id}/movements` (POST/GET). ცვლილება ერთ ტრანზაქციაში, `UPDATE ... WHERE on_hand + qty >= reserved`.
- ✅ პროდუქტის სურათები (2026-11-04): `POST/DELETE /v1/admin/products/{id}/images`, `PUT .../images/order`, საჯარო `GET /v1/media/...`. S3 staging-ზე, ლოკალურად დისკი (README → „პროდუქტის სურათები“). presigned URL-ის ნაცვლად — ატვირთვა API-ზე (usectl-ის S3 ბრაუზერისთვის მიუწვდომელია).
- ✅ staging-ზე deploy (usectl). სატესტო მონაცემები: `node dist/scripts/seed-demo.js --yes`.
- ⏭ შემდეგი: საჯარო `/v1/catalog/...` და `/v1/compatibility/...` (ფასეტები, თავსებადობის ფილტრი).
- სამუშაოს დასრულებისას განაახლე `../icomers/PROJECT.md` (§1, §2, §7).
