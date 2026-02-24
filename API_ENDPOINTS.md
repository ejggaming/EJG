# API Endpoints Reference

Base path: `/api` (configured via `config.baseApiPath`)

All endpoints require a valid JWT (cookie `token` or `Authorization: Bearer <token>`) **unless marked as Public**.

---

## Health Checks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | Root health check — returns status, timestamp, uptime |
| GET | `/health` | Public | Enhanced health check with SLA status |
| GET | `/health/redis` | Public | Redis health check — returns connection status, latency, memory usage |

---

## Auth

All routes are prefixed with `/api/auth`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register a new user account |
| POST | `/auth/login` | Public | Login with email + password, returns JWT cookie |
| POST | `/auth/logout` | Public | Logout, clears JWT cookie |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/change-password` | Required | Change the current user's password |
| GET | `/auth/me` | Required | Get current authenticated user profile |
| POST | `/auth/otp/request` | Public | Request a one-time password (OTP) code |
| POST | `/auth/otp/verify` | Public | Verify OTP code |
| GET | `/auth/users` | Admin | Get all users with optional filtering/pagination |

---

## Wallet

All routes are prefixed with `/api/wallet`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wallet/me` | Required | Get the current user's wallet balance + info |
| GET | `/wallet/transactions` | Required | Get the current user's transaction history |
| POST | `/wallet/deposit` | Required | Submit a deposit request |
| POST | `/wallet/withdraw` | Required | Submit a withdrawal request |
| PATCH | `/wallet/transaction/:id/approve` | Admin | Approve a pending deposit/withdrawal |
| PATCH | `/wallet/transaction/:id/reject` | Admin | Reject a pending deposit/withdrawal |
| GET | `/wallet/admin/transactions` | Admin | Get all transactions across all users |
| GET | `/wallet/:id` | Admin | Get a specific wallet by ID |
| GET | `/wallet` | Admin | Get all wallets with filtering/pagination |
| POST | `/wallet` | Admin | Create a new wallet record |
| PATCH | `/wallet/:id` | Admin | Update a wallet by ID |
| DELETE | `/wallet/:id` | Admin | Delete a wallet by ID |

---

## KYC (Know Your Customer)

All routes are prefixed with `/api/kyc`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/kyc/:id` | Required | Get a specific KYC record by ID |
| GET | `/kyc` | Required | Get all KYC records with filtering/pagination |
| POST | `/kyc` | Required | Submit a KYC application (supports file upload via multipart) |
| PATCH | `/kyc/:id` | Admin | Update KYC status (approve / reject) or data |
| DELETE | `/kyc/:id` | Admin | Delete a KYC record |

**Notes:**
- File upload (`multipart/form-data`) is used for document uploads (ID photos, selfies)
- Approving/rejecting via PATCH invalidates the Redis cache for the KYC list

---

## Draw Schedule

All routes are prefixed with `/api/drawSchedule`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/drawSchedule/:id` | Required | Get a specific draw schedule by ID |
| GET | `/drawSchedule` | Required | Get all draw schedules with filtering/pagination |
| POST | `/drawSchedule` | Admin | Create a new draw schedule |
| PATCH | `/drawSchedule/:id` | Admin | Update a draw schedule (time, isActive, cutoffMinutes) |
| DELETE | `/drawSchedule/:id` | Admin | Delete a draw schedule |

**Caching:** GET routes are cached in Redis (list: 60s TTL, by-ID: 90s TTL).

---

## Jueteng Draw

All routes are prefixed with `/api/juetengDraw`.

> Public: Unauthenticated GET requests are allowed for displaying live draw data.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/juetengDraw/:id` | Public | Get a specific draw by ID |
| GET | `/juetengDraw` | Public | Get all draws with filtering/pagination |
| POST | `/juetengDraw` | Admin | Create a new draw (starts in SCHEDULED state) |
| PATCH | `/juetengDraw/:id` | Admin | Update draw data |
| DELETE | `/juetengDraw/:id` | Admin | Delete a draw |
| POST | `/juetengDraw/:id/open` | Admin | Open a draw for betting (`SCHEDULED → OPEN`) |
| POST | `/juetengDraw/:id/close` | Admin | Close a draw (betting cutoff) (`OPEN → CLOSED`) |
| POST | `/juetengDraw/:id/result` | Admin | Record the tambiolo draw result (`CLOSED → DRAWN`) |
| POST | `/juetengDraw/:id/settle` | Admin | Settle payouts for a drawn result (`DRAWN → SETTLED`) |

**Draw State Machine:**
```
SCHEDULED → OPEN → CLOSED → DRAWN → SETTLED
```

---

## Jueteng Bet

All routes are prefixed with `/api/juetengBet`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/juetengBet/:id` | Required | Get a specific bet by ID |
| GET | `/juetengBet` | Required | Get all bets with filtering/pagination |
| POST | `/juetengBet` | Required | Place a new bet on an open draw |
| PATCH | `/juetengBet/:id` | Admin | Update a bet record |
| DELETE | `/juetengBet/:id` | Admin | Delete a bet record |

---

## Jueteng Config

All routes are prefixed with `/api/juetengConfig`.

> Public: Unauthenticated GET requests are allowed for reading game configuration.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/juetengConfig/:id` | Public | Get a specific config by ID |
| GET | `/juetengConfig` | Public | Get all configs with filtering/pagination |
| POST | `/juetengConfig` | Admin | Create a new game configuration |
| PATCH | `/juetengConfig/:id` | Admin | Update game config (maxNumber, minBet, maxBet, payoutMultiplier, cobradorRate) |
| DELETE | `/juetengConfig/:id` | Admin | Delete a game configuration |

**Caching:** GET routes are cached in Redis (list: 60s TTL, by-ID: 90s TTL).

---

## Jueteng Payout

All routes are prefixed with `/api/juetengPayout`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/juetengPayout/:id` | Required | Get a specific payout record by ID |
| GET | `/juetengPayout` | Required | Get all payout records with filtering/pagination |
| POST | `/juetengPayout` | Admin | Create a new payout record |
| PATCH | `/juetengPayout/:id` | Admin | Update a payout record |
| DELETE | `/juetengPayout/:id` | Admin | Delete a payout record |

---

## Commission

All routes are prefixed with `/api/commission`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/commission/:id` | Required | Get a specific commission record by ID |
| GET | `/commission` | Required | Get all commission records with filtering/pagination |
| POST | `/commission` | Admin | Create a new commission record |
| PATCH | `/commission/:id` | Admin | Update a commission record |
| DELETE | `/commission/:id` | Admin | Delete a commission record |

---

## Notification

All routes are prefixed with `/api/notification`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notification` | Required | Get all notifications for the current user |
| GET | `/notification/unread-count` | Required | Get unread notification count for current user |
| GET | `/notification/:id` | Required | Get a specific notification by ID |
| POST | `/notification` | Admin | Create and broadcast a notification |
| PUT | `/notification/:id` | Admin | Replace a notification record |
| PATCH | `/notification/:id/read` | Required | Mark a specific notification as read |
| PATCH | `/notification/read-all` | Required | Mark all notifications as read |
| DELETE | `/notification/:id` | Admin | Delete a notification |

**Real-time:** Notifications are pushed via Socket.IO to user-specific rooms and the `admin` room.

---

## Agent

All routes are prefixed with `/api/agent`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/agent/:id` | Required | Get a specific agent by ID |
| GET | `/agent` | Required | Get all agents with filtering/pagination |
| POST | `/agent` | Admin | Create a new agent |
| PATCH | `/agent/:id` | Admin | Update an agent |
| DELETE | `/agent/:id` | Admin | Delete an agent |

---

## Territory

All routes are prefixed with `/api/territory`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/territory/:id` | Required | Get a specific territory by ID |
| GET | `/territory` | Required | Get all territories with filtering/pagination |
| POST | `/territory` | Admin | Create a new territory |
| PATCH | `/territory/:id` | Admin | Update a territory |
| DELETE | `/territory/:id` | Admin | Delete a territory |

---

## Template

All routes are prefixed with `/api/template`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/template/:id` | Required | Get a specific template by ID |
| GET | `/template` | Required | Get all templates with filtering/pagination |
| POST | `/template` | Admin | Create a new template |
| PATCH | `/template/:id` | Admin | Update a template |
| DELETE | `/template/:id` | Admin | Delete a template |

---

## Session

All routes are prefixed with `/api/session`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/session/:id` | Required | Get a specific session by ID |
| GET | `/session` | Required | Get all sessions with filtering/pagination |
| POST | `/session` | Admin | Create a new session |
| PATCH | `/session/:id` | Admin | Update a session |
| DELETE | `/session/:id` | Admin | Delete a session |

---

## Common Query Parameters

All `GET /resource` (list) and `GET /resource/:id` endpoints support these query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Records per page, max 100 (default: 10) |
| `sort` | string | Field to sort by (e.g. `createdAt`) |
| `order` | `asc` \| `desc` | Sort order (default: `desc`) |
| `fields` | string | Comma-separated fields to return (supports dot notation) |
| `query` | string | Text search across searchable fields |
| `filter` | string | JSON array of filter objects, e.g. `[{"status":"PENDING"}]` |
| `groupBy` | string | Group results by a field name |
| `document` | `"true"` | Include document array in response |
| `pagination` | `"true"` | Include pagination metadata in response |
| `count` | `"true"` | Include total count in response |

---

## Response Format

### Success
```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Error description",
  "error": { ... }
}
```

### Paginated List
```json
{
  "success": true,
  "data": {
    "resources": [...],
    "count": 42,
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "totalRecords": 42
    }
  }
}
```

---

## Authentication

JWT is issued on login and stored as an HTTP-only cookie (`token`). It can also be passed as:
- Cookie: `token=<jwt>`
- Header: `Authorization: Bearer <jwt>`

Socket.IO connections authenticate the same way — the token is read from `socket.handshake.auth.token` or parsed from the `cookie` header.

---

*Total: 98 HTTP endpoints across 14 feature modules + 3 health check routes.*
