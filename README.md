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

## როგორ ვნახო, რომ მუშაობს

ხუთი ნაბიჯი. თითოეულზე წერია **რას უნდა ელოდე** — თუ სხვა რამე ხდება, პრობლემა სწორედ იმ ნაბიჯზეა და შემდეგზე გადასვლა აზრი არ აქვს.

### 1. ინფრასტრუქტურა

```bash
docker compose up -d
docker compose ps
```

**უნდა ნახო:** `postgres` და `mailpit` — `healthy`, `nats` — `running`.

### 2. API

```bash
nvm use            # Node 24; Prisma 7 Node 23-ს არ უშვებს
pnpm start:dev
```

**უნდა ნახო ტერმინალში:**

- `Mapped {/admin/products, GET} (version: 1) route` — თითო ხაზი თითო endpoint-ზე. **ეს არის დადასტურება, რომ route რეალურად არსებობს.** ახალი endpoint-ის დამატების შემდეგ პირველი, რასაც ვუყურებთ, ეს სიაა
- `Connected to PostgreSQL`
- `Nest application successfully started`

თუ env ცვლადი აკლია ან არასწორია, აპი **არ** ადგება და ლოგში ჩანს რომელია (`src/config/env.ts`).

### 3. Swagger — მთავარი ინსტრუმენტი

<http://localhost:4000/docs>

ეს არის API-ს „ცოცხალი“ ინტერფეისი და ყველაზე მარტივი გზა, რომ ყველაფერი ხელით გასინჯო **კოდის დაწერის გარეშე**:

1. აირჩიე endpoint (დაჯგუფებულია: `admin/catalog`, `admin/compatibility`, `admin/inventory`)
2. **Try it out** → ველების შევსება → **Execute**
3. ქვემოთ ჩანს სრული პასუხი: status code და JSON

თითოეულ ველზე ჩანს, სავალდებულოა თუ არა, რა ტიპია და რა შეზღუდვა აქვს — ეს ავტომატურად მოდის DTO-ების დეკორატორებიდან.

⚠️ ადმინის endpoint-ი `.env`-ში `DEV_ADMIN_ROLES`-ს მოითხოვს (იხ. ზემოთ). მარაგისთვის საჭიროა `warehouse`, `manager` ან `admin`.

### 4. ბაზა თვალით

```bash
pnpm db:studio     # ბრაუზერში გაიხსნება (ჩვეულებრივ http://localhost:5555)
```

ცხრილები, სტრიქონები და კავშირები. აქ მოწმდება მთავარი კითხვა: **„Swagger-იდან დავამატე — ბაზაში მართლა გაჩნდა?“**

SQL-ით უფრო სწრაფია:

```bash
docker compose exec postgres psql -U icomers -d icomers
# შიგნით: \dt  — ცხრილების სია,  \d products  — ერთი ცხრილის აღწერა,  \q  — გასვლა
```

### 5. ტესტები

| ბრძანება | რას ამოწმებს | რამდენად სწრაფია |
|---|---|---|
| `pnpm lint` | სტილი და აშკარა შეცდომები | წამი |
| `pnpm typecheck` | ტიპები — **ყველაზე იაფი გზა შეცდომის დასაჭერად** | წამები |
| `pnpm test` | unit: service-ების ლოგიკა, ბაზის გარეშე (stub-ებით) | ~2 წმ |
| `pnpm test:e2e` | endpoint-ები: route, ვალიდაცია, პასუხის ფორმა, guard | ~2 წმ |

ყოველი ცვლილების ბოლოს ოთხივე:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

**რას ნიშნავს „ტესტი მწვანეა“:** ის ამოწმებს ლოგიკას და კონტრაქტს, **არა** რეალურ SQL-ს — unit და e2e ტესტები ბაზის გარეშე გარბიან. ამიტომ raw SQL-ის (`$queryRaw`) ან ახალი მიგრაციის შემდეგ **აუცილებლად** გაიარე ნაბიჯი 3 ან 4 ხელით.

---

## როგორ გავაკეთო debug

### შეცდომის კოდები — რას ნიშნავს და ვისი ბრალია

ყველა შეცდომა ერთი ფორმატით ბრუნდება (`application/problem+json`) და მასში მთავარი ველი არის **`code`** — ის მუდმივია და ზუსტად ამბობს, რა მოხდა.

| Status | რას ნიშნავს | ვისი ბრალია |
|---|---|---|
| `400` | request-ის **ფორმა** არასწორია: აკლია ველი, ტიპი არ ემთხვევა, არა-uuid id. `errors`-ში ჩანს რომელი ველი | გამომძახებლის (ფრონტი / Swagger-ში შევსება) |
| `401` | ვინ ხარ — უცნობია | ტოკენი / `DEV_ADMIN_ROLES` |
| `403` | ხარ, მაგრამ როლი არ გაწყობს | როლები |
| `404` | ობიექტი არ არსებობს | id არასწორია |
| `409` | კონფლიქტი: `slug` დაკავებულია, მარაგი არ არის, წასაშლელი ცარიელი არ არის | მონაცემების მდგომარეობა — **ეს ნორმალური პასუხია, არა bug** |
| `422` | ფორმა სწორია, მაგრამ **ბიზნეს-წესი** დაირღვა: `ka` თარგმანი აკლია, ნიშანი ტიპს არ ემთხვევა | request-ის შინაარსი |
| `503` | ავტორიზაცია გამართული არ არის, ან გარე სერვისი არ პასუხობს | გარემო |
| `500` | **ჩვენი bug.** სხვა ყველა კოდი ჩვენ განზრახ დავაბრუნეთ, `500` — არა | კოდი |

`400` და `422`-ის განსხვავება მნიშვნელოვანია: `400`-ს აბრუნებს `ValidationPipe` (DTO-ს დეკორატორები), `422`-ს — ჩვენი `AppError` service-ში.

### თანმიმდევრობა, როცა რამე არ მუშაობს

1. **წაიკითხე `code`** პასუხში — ზედა ცხრილი გეუბნება, სად ეძებო
2. **`trace_id`** პასუხში = იგივე მნიშვნელობა ტერმინალის ლოგში `reqId`-ად. ასე აკავშირებ კონკრეტულ პასუხს კონკრეტულ ლოგის ხაზთან
3. **`500`-ზე** ტერმინალში სრული stack trace იწერება — ფაილი და ხაზი
4. **„რა SQL-ს აწარმოებს ჩემი კოდი?“** → `.env`-ში `LOG_SQL=true`, გადატვირთე. ყველა query ტერმინალში დაიწერება პარამეტრებით და ხანგრძლივობით. ლოგი ბევრია — გასარკვევად ჩართე და უკან გამორთე
5. **„ბაზაში რეალურად რა წერია?“** → `pnpm db:studio` ან `psql` (ნაბიჯი 4 ზემოთ)
6. **„ეს route საერთოდ არსებობს?“** → ტერმინალში `Mapped {...}` სია გაშვებისას

### გამოსადეგი წვრილმანები

- **`404` ყველა endpoint-ზე** — სავარაუდოდ `/v1` დაგავიწყდა: `/v1/admin/products`, არა `/admin/products` (გამონაკლისი — `/health/*` და `/docs`)
- **ველი პასუხში არ ჩანს, თუმცა კოდში წერია** — response DTO-ში `@ApiProperty()` და `toXxxResponse()` ფუნქციაში ორივეში უნდა იყოს
- **ტესტი მწვანეა, Swagger-ში არ მუშაობს** — სავარაუდოდ stub-ი რეალობას არ ემთხვევა. **მართალია Swagger**, და მაშინ stub უნდა გასწორდეს (ასეთი შემთხვევა უკვე გვქონდა)
- **`pnpm test:e2e`-ზე `503 AUTH_NOT_CONFIGURED`** — ასე უნდა იყოს, იხ. „ცნობილი პრობლემები“

### როგორ ვიცი, რომ გზიდან არ გადავუხვიეთ

- **`../icomers/PROJECT.md` §2** — სამუშაოს რიგითობა. ყოველი დასრულებული ნაბიჯი `[x]`-ით აღინიშნება და §7-ში ერთი ხაზი ჩაიწერება. „სად ვართ“ ყოველთვის აქ იკითხება
- **`CLAUDE.md` → „წესები ამ რეპოში“** — რა არის დაშვებული და რა არა (ფული მთელ რიცხვად, მარაგი ტრანზაქციაში, მოდულების საზღვრები)
- **`../icomers/docs/05-api.md`** — endpoint-ების სია, რომელიც უნდა არსებობდეს. თუ ვაკეთებთ იმას, რაც აქ წერია, გადახვევა არ ხდება

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

**ბრენჩები:** `develop` → staging, **`master`** → production. გუნდის კონვენციით მთავარი ბრენჩი ყველა პროექტზე `master`-ია (არა `main`) — ამაზეა მორგებული CI (`.github/workflows/ci.yml`) და deploy.
