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
docker compose up -d          # Postgres, NATS, Mailpit (სურათები ლოკალურად `.storage/`-ში — S3 არ სჭირდება)
pnpm install                  # აგენერირებს Prisma client-საც

pnpm db:migrate               # მიგრაციები უკვე რეპოშია — მხოლოდ გამოყენება
pnpm db:seed                  # სატესტო კატეგორიები, დამტენები, პროდუქტები + superadmin (.env → SEED_SUPERADMIN_*)

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
- **staging-ზე როგორ გადადის:** push `master`-ზე → usectl ააწყობს → `start.sh` უშვებს `prisma migrate deploy`-ს → staging-ის ბაზაზე გამოიყენება მხოლოდ ახალი მიგრაციები. სქემა გადადის, **მონაცემები არა**.
- ⚠️ **ორი წესი, რომ staging-ის ბაზა არ გაფუჭდეს:**
  1. commit-ებული მიგრაცია **აღარ შეცვალო და არ წაშალო** — შესწორება ახალი მიგრაციით. თორემ staging-ზე `migrate deploy` ჩავარდება და API აღარ ადგება.
  2. სვეტის/ცხრილის წაშლა ან გადარქმევა, ტიპის შეცვლა, სავალდებულო სვეტი `@default`-ის გარეშე მონაცემებიან ცხრილში — **push-მდე** წაიკითხე `migration.sql` (ან აჩვენე Claude-ს). საჭიროებისას ორ ნაბიჯად: ჯერ nullable + შევსება, მერე `NOT NULL`.
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

მომხმარებლები ჩვენს ბაზაშია (`admin_users`), საჯარო რეგისტრაცია **არ არის** — ახალ მომხმარებელს
ქმნის `superadmin` (`POST /v1/admin/users`). გადაწყვეტილება: `PROJECT.md` §6 (2026-11-04).

| რა | როგორ |
|---|---|
| პაროლი | scrypt (`src/modules/auth/password.ts`), მინიმუმ 10 სიმბოლო. 5 წარუმატებელი ცდა → 15 წუთით `429 ACCOUNT_LOCKED` |
| access token | JWT, ES256, 15 წუთი. `iss`/`aud`/`typ: at+jwt` მოწმდება. საჯარო გასაღები: `GET /.well-known/jwks.json` |
| refresh token | შემთხვევითი სტრიქონი, ბაზაში მხოლოდ SHA-256 ჰეში, 14 დღე. ყოველ refresh-ზე იცვლება; ძველის ხელახლა წარდგენა მთელ სესიას აუქმებს |
| ბრაუზერი (ადმინკა) | `POST /v1/auth/login` / `refresh` / `logout` — ტოკენები httpOnly + `SameSite=Strict` cookie-ებში (`icomers_admin_at`, `icomers_admin_rt`) |
| სხვა კლიენტები | `POST /v1/auth/token` — OAuth 2.0 (`grant_type=password` / `refresh_token`), შემდეგ `Authorization: Bearer ...` |
| როლები | ბაზიდან იკითხება ყოველ მოთხოვნაზე: როლის მოხსნა, გათიშვა ან პაროლის შეცვლა **მაშინვე** მოქმედებს |
| `superadmin` | ყველა როლს ფარავს + მომხმარებლების მართვა. საკუთარ თავს ვერ მოიხსნის; ბოლო superadmin-ს ვერავინ მოხსნის |
| ჩაკეტვა | 5 არასწორი ცდა (ატომური მთვლელი) → 15 წუთი. `429 ACCOUNT_LOCKED` მხოლოდ **სწორ** პაროლზე ჩანს — სხვები ხედავენ `401`-ს, რომ ელ. ფოსტის არსებობა ვერ გაიგონ |
| CSRF | `src/modules/auth/csrf.middleware.ts`: cookie-ით მოსული ცვლილება (და login/refresh/logout/password) უარყოფილია `Sec-Fetch-Site: cross-site / same-site`-ზე და არა-JSON body-ზე → `403 CSRF_REJECTED`. Bearer-ს არ ეხება |
| ერთდროული refresh | ორმა ჩანართმა ერთად სცადა → წაგებული იღებს `409 REFRESH_RACE`-ს (cookie-ები არ იშლება), ადმინკა უბრალოდ იმეორებს მოთხოვნას |

პირველი superadmin: `.env`-ში `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, შემდეგ `pnpm db:seed`.
თუ მომხმარებელი უკვე არსებობს, seed პაროლს **არ ცვლის**.

**პაროლის შეცვლა:** ჩვეულებრივ — ადმინკაში (მომხმარებლის მენიუ → „პაროლის შეცვლა“; სხვისი — „მომხმარებლები“).
თუ შესვლა აღარ შეგიძლია (დაგავიწყდა, ანგარიში ჩაიკეტა) — პირდაპირ ბაზაში:

```bash
pnpm admin:password superadmin@example.com                                 # ლოკალურად (პაროლს გკითხავს)
node dist/scripts/set-admin-password.js superadmin@example.com             # usectl: icomers-api → Terminal
```

ცვლის ჰეშს, ხსნის ჩაკეტვას და აუქმებს ამ მომხმარებლის ყველა სესიას. `SEED_SUPERADMIN_PASSWORD`-ის შეცვლა env-ში
პაროლს **არ** ცვლის — ის მხოლოდ პირველად შექმნისას გამოიყენება.

```bash
# ტოკენი (OAuth 2.0)
curl -s -d grant_type=password -d username=superadmin@example.com -d password='...' \
  localhost:4000/v1/auth/token
# → { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 900, "refresh_token": "..." }

curl -s -H "Authorization: Bearer eyJ..." localhost:4000/v1/admin/products
```

Swagger-ში: **Authorize** → `bearer` ველში access token.

`JWT_PRIVATE_KEY` production-ში სავალდებულოა (გარეშე აპი არ ეშვება). ლოკალურად თუ ცარიელია,
დროებითი გასაღები იქმნება და API-ს ყოველ გადატვირთვაზე access token-ები უქმდება (ადმინკა refresh-ით თავად აღდგება).

### რა არსებობს ახლა

| endpoint-ების ჯგუფი | როლები (`src/modules/auth/roles.ts`) |
|---|---|
| `/v1/admin/categories`, `/v1/admin/products` | `CATALOG_EDITOR_ROLES`: `content_editor`, `manager`, `admin` |
| `/v1/admin/charger-brands`, `/v1/admin/charger-models`, `/v1/admin/products/{id}/compatibility` | იგივე |
| `/v1/admin/inventory/...` | `INVENTORY_ROLES`: `warehouse`, `manager`, `admin` |

| `/v1/admin/products/{id}/images` (ატვირთვა, რიგი, წაშლა) | `CATALOG_EDITOR_ROLES` |
| `GET /v1/media/products/{product_id}/{file}` | საჯარო (ავტორიზაციის გარეშე) |

სრული სია: Swagger `/docs` ან `openapi.json`.

**პროდუქტის სურათები.** ფაილი API-ზე იტვირთება: `POST /v1/admin/products/{id}/images`,
`multipart/form-data`, ველი `file` (JPEG / PNG / WebP, ≤ 8 MB, ტიპი ფაილის შიგთავსით მოწმდება).
presigned URL-ით პირდაპირ S3-ში ატვირთვა **არ** გამოდგება: usectl-ის S3 კლასტერის შიგნითაა
(`S3_ENDPOINT=external-s3...svc:8333`) და ბრაუზერი მას ვერ ხედავს. იმავე მიზეზით სურათს
`GET /v1/media/...` აბრუნებს (ქეში — 1 წელი, ფაილის სახელი uuid-ია და არ იცვლება).
პასუხებში: `images[].url` და სიაში `image_url` — მისამართი API-ს ფესვიდან (`/v1/media/...`).
საცავი (`src/infra/storage/`): **S3**, თუ `S3_ENDPOINT` მითითებულია (staging), თორემ **ლოკალური
დისკი** — `STORAGE_LOCAL_DIR` (ნაგულისხმევად `.storage/`, git-ში არ არის). ლოკალურად S3 არ გვჭირდება.
CSRF: cookie-იან `multipart` მოთხოვნას სჭირდება `X-Requested-With` header (HTML ფორმა მას ვერ
აგზავნის) — ადმინკა მას `uploadProductImage()`-ში ამატებს.

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

⚠️ ადმინის endpoint-ს ტოკენი სჭირდება: **Authorize** → access token (`POST /v1/auth/token`, იხ. ზემოთ). მარაგისთვის საჭიროა `warehouse`, `manager`, `admin` ან `superadmin`.

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
| `401` | ვინ ხარ — უცნობია: ტოკენი არ არის (`UNAUTHORIZED`), ვადა გაუვიდა ან სესია გაუქმდა (`TOKEN_INVALID`), არასწორი პაროლი (`INVALID_CREDENTIALS`) | ტოკენი / ლოგინი |
| `403` | ხარ, მაგრამ როლი არ გაწყობს | როლები |
| `404` | ობიექტი არ არსებობს | id არასწორია |
| `409` | კონფლიქტი: `slug` დაკავებულია, მარაგი არ არის, წასაშლელი ცარიელი არ არის | მონაცემების მდგომარეობა — **ეს ნორმალური პასუხია, არა bug** |
| `422` | ფორმა სწორია, მაგრამ **ბიზნეს-წესი** დაირღვა: `ka` თარგმანი აკლია, ნიშანი ტიპს არ ემთხვევა | request-ის შინაარსი |
| `503` | ბაზა არ პასუხობს (`DATABASE_UNAVAILABLE`), ან გარე სერვისი არ პასუხობს | გარემო — **კოდი უდანაშაულოა** |
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
- **`401 TOKEN_INVALID` API-ს გადატვირთვის შემდეგ** — `.env`-ში `JWT_PRIVATE_KEY` ცარიელია, ყოველ გაშვებაზე ახალი გასაღები იქმნება. ჩაწერე მუდმივი გასაღები (`.env.example`-ში ბრძანებაა)
- **`503 DATABASE_UNAVAILABLE`** — Postgres არ პასუხობს, კოდში შეცდომა არ არის: `docker compose up -d`. ლოგში ერთი სტრიქონია დრაივერის კოდით (`ECONNREFUSED` — კონტეინერი არ მუშაობს, `ENOTFOUND` — `DATABASE_URL`-ის host არასწორია)

### როგორ ვიცი, რომ გზიდან არ გადავუხვიეთ

- **`../icomers/PROJECT.md` §2** — სამუშაოს რიგითობა. ყოველი დასრულებული ნაბიჯი `[x]`-ით აღინიშნება და §7-ში ერთი ხაზი ჩაიწერება. „სად ვართ“ ყოველთვის აქ იკითხება
- **`CLAUDE.md` → „წესები ამ რეპოში“** — რა არის დაშვებული და რა არა (ფული მთელ რიცხვად, მარაგი ტრანზაქციაში, მოდულების საზღვრები)
- **`../icomers/docs/05-api.md`** — endpoint-ების სია, რომელიც უნდა არსებობდეს. თუ ვაკეთებთ იმას, რაც აქ წერია, გადახვევა არ ხდება

## ცნობილი პრობლემები (ლოკალური გარემო)

| პრობლემა | მიზეზი და გამოსავალი |
|---|---|
| `pnpm install` ვარდება: *„Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+“* | სისტემაში Homebrew-ის Node 23-ია. `nvm use` (რეპოში `.nvmrc`), ან სამუდამოდ `nvm alias default 24` |
| `docker compose up -d` ვარდება: *„pull access denied for minio/minio“* | MinIO-ს community image-ები აღარ არის თავისუფლად ჩამოსატვირთი, სერვისი კომენტარშია `docker-compose.yml`-ში. **ლოკალურად S3 აღარ გვჭირდება:** `S3_ENDPOINT` ცარიელია → სურათები `.storage/`-ში იწერება (იხ. „პროდუქტის სურათები“) |
| macOS: *„You can't open the application Docker because it is not responding“* | Docker Desktop-ის GUI მოკვდა, backend პროცესები მიტოვებული დარჩა. გაასუფთავე და ხელახლა გაუშვი: `pkill -f 'Docker.app/Contents/MacOS'` → `open -a Docker` |
| API `503 DATABASE_UNAVAILABLE`-ს აბრუნებს (ლოგში `ECONNREFUSED`) | Postgres არ მუშაობს. **Docker Desktop-ის გაშვება კონტეინერებს არ უშვებს** — საჭიროა `docker compose up -d` რეპოს ფოლდერიდან. შემოწმება: `docker compose ps` (სამი კონტეინერი `Up`) და `nc -zv localhost 5432`. API-ს გადატვირთვა არ სჭირდება — Prisma ახალ მოთხოვნაზე თავად დაუკავშირდება |
| ტესტებში ადმინის endpoint-ი 401-ს აბრუნებს | ტოკენი არ არის. endpoint-ის ტესტირებისას guard გადაფარე `.overrideGuard(AdminGuard)`-ით (**არა** `overrideProvider`-ით — guard-ზე ის არ მოქმედებს). მაგალითი: `test/admin-catalog.e2e-spec.ts`. მთელი auth ნაკადი ბაზის გარეშე: `test/auth.e2e-spec.ts` (`test/support/fake-auth-prisma.ts`) |

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

**staging (2026-11-04):** Machine `ev-shop-docs`, pod **`icomers-api`** — private (გარედან პირდაპირ არ ჩანს),
ხელმისაწვდომია მხოლოდ ადმინკის nginx-ით: https://icomers-admin.usectl.com/api/... . auto-deploy: push `master`-ზე.

ერთი `Dockerfile`. ნაგულისხმევი ბრძანება — `scripts/start.sh`:

1. `prisma migrate deploy` (გამოტოვება: `RUN_MIGRATIONS=false`)
2. superadmin, თუ `SEED_SUPERADMIN_EMAIL` + `SEED_SUPERADMIN_PASSWORD` მითითებულია (არსებულის პაროლს არ ცვლის)
3. `node dist/main.js`, port 4000

worker-ისთვის (მომავალში): იგივე image, ბრძანება `node dist/worker.js`, `RUN_MIGRATIONS=false`.

| env | საიდან |
|---|---|
| `DATABASE_URL` | Postgres addon (pod-ზე **attach** უნდა იყოს) — ხელით არ იწერება |
| `S3_*`, `AWS_*` | S3 addon (attach) — პროდუქტის სურათები. API იყენებს `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_USE_SSL` |
| `JWT_PRIVATE_KEY` | **საიდუმლო**, protected. `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256` |
| `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` | პირველი superadmin. პაროლი — **საიდუმლო** |
| `JWT_ISSUER`, `JWT_AUDIENCE` | `https://<ადმინკის დომენი>/api`, `icomers-admin` |
| `TRUST_PROXY_HOPS` | `2` (Traefik → ადმინკის nginx) |
| `SWAGGER_ENABLED`, `LOG_LEVEL` | staging: `true`, `info` |
| `CORS_ORIGINS` | staging: `http://localhost:3000,http://localhost:3001` (იხ. ქვემოთ) |

`NODE_ENV=production` Dockerfile-შია.

`CORS_ORIGINS` (staging): `http://localhost:3000,http://localhost:3001` — მხოლოდ ლოკალური frontend-ისთვის (3000)
და ადმინკისთვის (3001), რომ ბრაუზერიდან staging-ის API-ს პირდაპირ მიმართვაზე CORS-ის შეცდომა არ ამოვარდეს.
ადმინკის staging დომენს CORS არ სჭირდება (`/api` იმავე origin-ზეა). `*` არ შეიძლება (`credentials: true`).
⚠️ ადმინკის **ლოგინი** სხვა origin-იდან მაინც არ იმუშავებს (`SameSite=Strict` cookie + CSRF-ის დაცვა) —
ლოკალურ ადმინკას staging-თან `npm run dev:staging` აკავშირებს (Vite proxy, იხ. `ev-icomers-admin/README.md`).
CORS ძირითადად საჯარო, ლოგინის გარეშე endpoint-ებისთვისაა (storefront-ის კატალოგი).

Swagger staging-ზე: https://icomers-admin.usectl.com/api/docs . პაროლის აღდგენა: pod → Terminal →
`node dist/scripts/set-admin-password.js <email>` (იხ. „ადმინის endpoint-ები და ავტორიზაცია“).

**სატესტო მონაცემები staging-ზე** (იგივე, რაც ლოკალურად `pnpm db:seed`: 3 კატეგორია, დამტენის ბრენდები/მოდელები,
3 პროდუქტი მარაგით): pod → Terminal → `node dist/scripts/seed-demo.js --yes`. განმეორებით გაშვება უსაფრთხოა
(არსებულს არ ცვლის, დუბლიკატს არ ქმნის). მონაცემები `src/scripts/demo-data.ts`-შია. ⚠️ ნამდვილ production-ზე არა.

**გაკვეთილები პირველი deploy-იდან:**
- `prisma generate` Docker-ში `tsconfig.json`-მდე ეშვება → `schema.prisma`-ში `importFileExtension = "js"` სავალდებულოა.
- usectl-ზე ყოველი pod ნაგულისხმევად 1 GiB ephemeral storage-ს ითხოვს — Machine-ის storage pod-ების რაოდენობაზე უნდა გათვალო.
- დომენი ერთდონიანი უნდა იყოს (`icomers-admin.usectl.com`): Cloudflare-ის SSL სამდონიანს არ ფარავს.
