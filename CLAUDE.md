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
| მოგვიანებით | NATS JetStream (`@nats-io/*`), gRPC (`@grpc/grpc-js`, Buf, ts-proto), S3 (`@aws-sdk/client-s3`), `jose` (JWT/JWKS) |

## ბრძანებები

```bash
nvm use                     # Node 24 — სისტემაში Node 23-ია, Prisma მას არ უშვებს
docker compose up -d        # Postgres, NATS, Mailpit (MinIO დროებით გათიშულია)
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
- **კომპანიის სერვისები** (Billing, Fiscal, Identity) მხოლოდ ინტერფეისის მიღმა (`PaymentGateway`, `FiscalGateway`): gRPC იმპლემენტაცია + mock ტესტებისთვის. proto ფაილები ჯერ არ გვაქვს — ბიზნეს-ლოგიკა ინტერფეისზე იწერება.
- **ავტორიზაცია:** ყველა `/v1/admin/*` — `@UseGuards(AdminGuard)` + `@Roles()` (`src/modules/auth/`). ტოკენის ვერიფიკაცია ჯერ არ არის (Identity გვაკლია), guard dev-ის გარეთ `503`-ს აბრუნებს — დეტალები README-ში.
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
- ✅ `auth` მოდული — `AdminGuard` + `@Roles()`. **JWT/JWKS ჯერ არ არის**: dev-ში როლები `DEV_ADMIN_ROLES`/`X-Dev-Roles`-იდან, სხვაგან `503 AUTH_NOT_CONFIGURED` (README → „ადმინის endpoint-ები და ავტორიზაცია“).
- ⏭ შემდეგი: `compatibility` და `inventory` მოდულები ადმინკისთვის, შემდეგ საჯარო `/v1/catalog/...`.
- ⚠️ გადასაწყვეტია: MinIO-ს ჩანაცვლება ლოკალური S3-ისთვის (README → „ცნობილი პრობლემები“). საჭირო ხდება ეტაპ 1-ზე, სურათების ატვირთვისას.
- სამუშაოს დასრულებისას განაახლე `../icomers/PROJECT.md` (§1, §2, §7).
