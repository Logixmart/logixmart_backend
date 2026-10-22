# Logixmart Backend

REST API for the Logixmart company website — blogs, portfolio (Our Works), careers, contact forms, client reviews, and an admin panel.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access + refresh) + bcrypt |
| Uploads | Multer (images, resumes) |
| Security | Helmet, CORS, rate limiting, compression |

## Features

- **Admin auth** — login, refresh token, logout, role-based access (`ADMIN` / `SUPER_ADMIN`)
- **Blogs** — public list/detail; admin CRUD with optional image
- **Our Works** — portfolio items with `websiteUrl`, `appStoreUrl`, `playStoreUrl`, multi-image upload
- **Job posts** — public careers list; admin CRUD (soft delete)
- **Job applications** — public apply with optional resume; admin review, status updates, protected resume download, Excel export
- **Contact** — public form submit; admin list/delete/export
- **Client reviews** — public list; admin CRUD
- **Health check** — verifies API + database connectivity

## Project structure

```
src/
├── server.ts          # HTTP server + graceful shutdown
├── app.ts             # Express app, middleware, static uploads
├── config/            # Environment config
├── routes/            # URL mounts
├── controllers/       # Request/response handlers
├── services/          # Business logic + Prisma
├── middlewares/       # Auth, upload, rate limit, errors
├── lib/               # Prisma client, JWT helpers
└── utils/             # Pagination, validation, AppError
prisma/
├── schema.prisma      # Database models
├── migrations/        # SQL migrations
└── seed.ts            # Bootstrap super admin
```

## Prerequisites

- Node.js 18+
- npm
- Docker (optional, for PostgreSQL / full stack)

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set real values (never commit `.env`):

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default `5001` in example) |
| `NODE_ENV` | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `ADMIN_EMAIL` | Bootstrap super admin email |
| `ADMIN_PASSWORD` | Bootstrap super admin password |
| `API_BASE_URL` | Public base URL for uploaded file links |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `UPLOAD_DIR` | Upload root folder (default `uploads`) |
| `SUPABASE_URL` | Supabase project URL (Storage) |
| `SUPABASE_SECRET_KEY` | Server-only service-role/secret key — never expose to the frontend |
| `SUPABASE_IMAGE_BUCKET` | Public image bucket (default `user-images`) |
| `SUPABASE_RESUME_BUCKET` | Private resume bucket (default `private-resumes`) |
| `MAIL_PROVIDER` | Email provider: `smtp` (default) or `resend` |
| `RESEND_API_KEY` | Resend API key — server-only; required when `MAIL_PROVIDER=resend` |
| `SMTP_HOST` | Outbound SMTP host (when `MAIL_PROVIDER=smtp`) |
| `SMTP_PORT` | SMTP port (`587` STARTTLS or `465` TLS) |
| `SMTP_SECURE` | `true` for implicit TLS (465), `false` for STARTTLS (587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / App Password — server-only, never expose |
| `MAIL_FROM` | Verified sender address (must be authorized for the SMTP account) |
| `HR_NOTIFICATION_EMAIL` | HR recipient for job applications (default `pallvi.rana@logixmart.com` in `.env.example`) |
| `CLIENT_QUERY_EMAIL` | Client query recipient (default `abhinav.kumar@logixmart.com` in `.env.example`) |
| `ADMIN_APP_URL` | Optional admin panel base URL for the application link in HR emails |

### 3. Start PostgreSQL

```bash
npm run db:up
```

Or use your own Postgres instance and point `DATABASE_URL` at it.

### 4. Run migrations + seed

```bash
npx prisma migrate deploy
npm run db:seed
```

### 5. Start the API

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

API base: `http://localhost:<PORT>/api`  
Health: `GET /api/health`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Generate Prisma client + compile TypeScript |
| `npm start` | Run compiled `dist/server.js` |
| `npm run typecheck` | TypeScript check without emit |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Apply migrations (deploy) |
| `npm run prisma:migrate:dev` | Create/apply migrations (dev) |
| `npm run db:seed` | Seed bootstrap admin |
| `npm run db:up` | Start Postgres via Docker Compose |
| `npm run db:backup` | Dump Postgres from Docker → `backups/` |
| `npm run db:restore` | Restore latest (or given) dump into Docker |
| `npm run test` | Run the Node.js test suite |
| `npm run check:storage` | Read-only check that Supabase Storage buckets exist |
| `npm run check:smtp` | Verify SMTP connectivity/auth without sending email |
| `npm run docker:up` | Build and start API + Postgres |
| `npm run docker:down` | Stop Docker services |

## Database backup (Docker)

Postgres data lives in the Docker volume `logixmart_pgdata`. Take SQL dumps so you can recover if the volume is wiped.

```bash
# Ensure Postgres is running
npm run db:up

# Create a dump: backups/logixmart_YYYY-MM-DD_HHMMSS.sql
npm run db:backup

# Restore the latest dump (asks for confirmation)
npm run db:restore

# Or restore a specific file
npm run db:restore -- backups/logixmart_2026-09-15_143000.sql
```

Optional env overrides: `POSTGRES_CONTAINER`, `POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_DIR`, `KEEP_DAYS` (default retention 14 days).

Daily cron example (2 AM):

```bash
0 2 * * * cd /Users/development/logixmart_backend && npm run db:backup
```

Do not commit dump files — `backups/*.sql` is gitignored.

## API overview

All routes are under `/api`.

| Prefix | Access | Purpose |
|--------|--------|---------|
| `GET /` | Public | API welcome |
| `GET /health` | Public | Health + DB check |
| `/admin` | Mixed | Login / refresh / logout; user CRUD (super admin) |
| `/blogs` | Public read; admin write | Blog CRUD |
| `/our-works` | Public read; admin write | Portfolio CRUD |
| `/job-posts` | Public read/apply; admin write | Jobs + applications |
| `/job-applications` | Admin | List, status, resume download, export |
| `/contact` | Public submit; admin manage | Contact form |
| `/client-reviews` | Public read; admin write | Testimonials |
| `/storage` | Admin | Signed Supabase upload URLs |

### Auth

```http
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your-password"
}
```

Protected routes:

```http
Authorization: Bearer <accessToken>
```

### Pagination

List endpoints typically accept:

```
?page=1&limit=20
```

Response shape:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Uploads

Images can be uploaded two ways:

1. **Direct to Supabase Storage (recommended)** — the admin panel requests a
   short-lived signed upload URL, uploads the compressed file straight to the
   `user-images` bucket, then submits the object path to the Blog / Our Works
   APIs. The file bytes never pass through this API.
2. **Legacy multipart** — `image` / `images` form fields still work and are kept
   for backward compatibility.

| Feature | New field | Max | Stored value |
|---------|-----------|-----|--------------|
| Blog image | `imageUrl` (object path) | 1 image, 5MB | `blogs/<uuid>.jpg` |
| Our Works | `imageUrls` (JSON array of object paths) | 5 images, 5MB each | `our-works/<uuid>.png` |

Legacy multipart fields:

| Feature | Field | Max | Served at |
|---------|-------|-----|-----------|
| Blog image | `image` | 1 file, 5MB | `/uploads/blogs/...` |
| Our Works | `images` | up to 10, 5MB each | `/uploads/our-works/...` |
| Resume | `resume` | 1 file (pdf/doc/docx) | Admin download only |

Allowed image types: `jpeg`, `jpg`, `png`, `webp`.

#### Signed upload URL

```http
POST /api/storage/upload-url
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "folder": "blogs",
  "filename": "compressed-image.jpg",
  "contentType": "image/jpeg",
  "size": 204800
}
```

`folder` must be `blogs` or `our-works`; `contentType` must be `image/jpeg`,
`image/png` or `image/webp`; the filename extension must match the MIME type;
`size` must be ≤ 5MB. The object path is generated on the server — the client
cannot choose it.

```json
{
  "success": true,
  "data": {
    "bucket": "user-images",
    "path": "blogs/0f2c...-9a.jpg",
    "token": "short-lived-upload-token",
    "signedUrl": "https://<project>.supabase.co/storage/v1/object/upload/sign/..."
  }
}
```

Upload the file with the Supabase JS SDK:

```js
await supabase.storage
  .from(data.bucket)
  .uploadToSignedUrl(data.path, data.token, compressedFile);
```

Then send `data.path` as `imageUrl` (Blog) or inside the `imageUrls` array
(Our Works). Object paths (`blogs/...`, `our-works/...`) are resolved to public
URLs in API responses; legacy `/uploads/...` paths and absolute URLs continue
to resolve unchanged.

#### Resume signed upload URL (public applicants)

Applicants upload resumes directly to the private `private-resumes` bucket.
This endpoint is public (no admin JWT) and is rate limited like the apply
endpoint.

```http
POST /api/job-posts/:jobId/applications/resume/upload-url
Content-Type: application/json

{
  "filename": "resume.pdf",
  "contentType": "application/pdf",
  "size": 204800
}
```

The backend validates the job is accepting applications, the extension
(`pdf`, `doc`, `docx`), the MIME type (empty MIME types are allowed when the
extension is valid) and the size (≤ 5MB), then generates the object path on
the server.

```json
{
  "success": true,
  "data": {
    "bucket": "private-resumes",
    "path": "resumes/0f2c...-9a.pdf",
    "token": "short-lived-upload-token"
  }
}
```

Upload the file with the Supabase JS SDK, then submit the application:

```js
await supabase.storage
  .from(data.bucket)
  .uploadToSignedUrl(data.path, data.token, resumeFile);
```

#### Application submission

```http
POST /api/job-posts/:jobId/applications
Content-Type: application/json

{
  "applicantName": "Jane Doe",
  "email": "jane@example.com",
  "phone": "555-0100",
  "coverLetter": "...",
  "resumePath": "resumes/0f2c...-9a.pdf"
}
```

`resumePath` must be a safe object path under `resumes/`; traversal, absolute
URLs, filesystem paths and other bucket prefixes are rejected. The backend
verifies the object exists in the private bucket before saving it in
`JobApplication.resumeUrl` (the raw object path — never a public or signed
URL). If both `resumePath` and a multipart `resume` file are supplied the
request is rejected with `400`. The legacy multipart `resume` field remains
supported for backward compatibility. Orphaned objects left by a failed
application creation are cleaned up when safe (never when still referenced).

The `private-resumes` bucket must exist and stay **private**. Verify without
modifying anything:

```bash
npm run check:storage
```

The `user-images` bucket must exist and be **public** for image URLs to load.
Verify without modifying anything:

```bash
npm run check:storage
```

If it is missing, create it in the Supabase Dashboard (Storage → New bucket,
name `user-images`, public) — the backend never creates or changes buckets.

### Email notifications

The backend sends two transactional notifications using the configured mail
provider:

| Notification | Trigger | Recipient env var |
|--------------|---------|-------------------|
| Job application received | After a job application is saved | `HR_NOTIFICATION_EMAIL` |
| Client query submitted | After a contact/query is saved | `CLIENT_QUERY_EMAIL` |

Recipients are independent — client queries are **never** redirected to HR and
vice versa. Emails are sent only **after** the database write succeeds. If
email delivery fails, the record is kept and the API still reports success;
failures are logged without exposing credentials, tokens, or resume paths.
Resumes are never attached or linked — HR downloads them from the authorized
admin endpoint.

#### SMTP provider identification (if using SMTP)

- The provider is **not yet confirmed**. No hostname, port, password, or sender
  address is hardcoded; all connection settings are environment-driven.
- Clue only: a DNS MX lookup for `logixmart.com` resolves to `smtp.google.com`
  and the SPF record is `v=spf1 include:_spf.google.com ~all`. This indicates
  inbound mail is routed through **Google Workspace**, but MX records do not
  prove the outbound SMTP server. Confirm with the email administrator.
- **How to obtain the official settings:** ask the company email administrator
  for the outbound SMTP host, port, TLS mode (STARTTLS vs implicit TLS), the
  authentication method (username/password, App Password, or OAuth2), and the
  verified sender address. If Google Workspace is used, an App Password (with
  2-Step Verification enabled) is typically required for SMTP AUTH; the
  administrator must authorize the sending address/alias.

#### Configure SMTP

Set `MAIL_PROVIDER=smtp` and configure SMTP values (never commit `.env`):

```dotenv
SMTP_HOST=<smtp-host-from-email-admin>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password-or-app-password>
MAIL_FROM=<verified-sender@logixmart.com>
HR_NOTIFICATION_EMAIL=pallvi.rana@logixmart.com
CLIENT_QUERY_EMAIL=abhinav.kumar@logixmart.com
ADMIN_APP_URL=            # optional; enables the application link in HR email
```

#### Configure Resend HTTPS API

Use Resend when SMTP egress is unavailable. Set `MAIL_PROVIDER=resend`,
`RESEND_API_KEY`, and `MAIL_FROM`. The sender must be a verified domain/address
in your Resend account. The backend calls Resend's HTTPS API directly; no SMTP
connection is used.

#### Render deployment

For a Render-hosted backend, add the mail variables under the backend web
service's **Environment** settings; the repository `.env` is not deployed.
For the Resend API, set `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM`,
and `HR_NOTIFICATION_EMAIL` (plus `CLIENT_QUERY_EMAIL` for contact
notifications). Save the changes and redeploy/restart the service so the
running process loads them. Keep the API key backend-only.

**Render Free web services cannot send outbound SMTP traffic on ports 25, 465,
or 587** (port 25 is blocked for all Render services). If the backend uses the
Free plan, SMTP delivery will fail even when the variables are correct. Use
Resend's HTTPS API or upgrade to a service plan that permits SMTP egress. See
Render's [free instance limitations](https://render.com/docs/free).

#### Safe verification

For SMTP only, check connectivity and authentication **without sending email**:

```bash
npm run check:smtp
```

This calls `transporter.verify()` and never prints credentials. It verifies
the environment where the command runs, not another deployment's environment.

**Real delivery test (requires approval):** after the administrator approves a
one-off test, temporarily set both recipient variables to a mailbox you control
(or ask the administrator to whitelist the test), then trigger one real
submission through the public API and confirm arrival — for example:

```bash
curl -X POST "$API_BASE_URL/api/job-posts/<jobId>/applications" \
  -H 'Content-Type: application/json' \
  -d '{"applicantName":"SMTP Test","email":"smtp-test@logixmart.com"}'
```

Then revert the recipient variables. Do not leave test recipients configured.

#### Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `SMTP disabled` warning at startup | `SMTP_HOST` / `MAIL_FROM` missing — set them in `.env` |
| `EAUTH` / authentication failed | Wrong `SMTP_USER`/`SMTP_PASS`; for Gmail/Workspace use an App Password with 2FA enabled and confirm SMTP AUTH is enabled |
| `ECONNECTION` / timeout | Wrong `SMTP_HOST`/`SMTP_PORT`; port blocked by firewall or cloud egress rules |
| TLS / certificate errors | Mismatched `SMTP_SECURE` vs port (`false`+587 STARTTLS, `true`+465 TLS); provider may require a specific TLS mode |
| `550 sender rejected` | `MAIL_FROM` not authorized as an alias on the SMTP account |
| Emails accepted but not delivered | Check SPF/DKIM/DMARC, spam folder, and that recipients are correct |

Postman collection: `Logixmart_Backend.postman_collection.json` (use environment variables for secrets — do not hardcode passwords).

## Docker

Full stack:

```bash
npm run docker:up
```

Postgres only:

```bash
npm run db:up
```

Set `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DATABASE_URL` via env / Compose overrides for production. Do not rely on placeholder defaults.

The full-stack Compose service requires `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` to be set in the environment before `npm run docker:up`; it will refuse to start if any are missing.

## Architecture flow

```
Request
  → Helmet / CORS / compression / rate limit
  → Routes
  → Auth / upload middleware (when needed)
  → Controller
  → Service (validation + Prisma)
  → PostgreSQL
  → JSON response
```

Errors are thrown as `AppError` and handled by the global `errorHandler`.

## Security notes

- Never commit `.env` — it is gitignored.
- Use strong unique values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ADMIN_PASSWORD`.
- Production requires secrets via environment variables (no weak defaults).
- Resumes are not publicly served; download requires an admin token.
- Rate limits apply to login, contact, job applications, and the general API.
- SMTP credentials (`SMTP_PASS`) are backend-only, never logged, and must never
  be placed in React `VITE_*` variables or returned by the API. There is no
  public endpoint that sends arbitrary email; notifications are triggered only
  by stored job applications and contact queries.

## License

ISC
