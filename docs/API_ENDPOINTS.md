# Jueteng Platform — API Endpoints Reference

> **Base URL:** `http://localhost:<PORT>/api`
> **Auth:** JWT Bearer token via httpOnly cookies (set on login/register). All routes except `/auth` and `/docs` require authentication.
> **Database:** MongoDB · **Currency:** PHP

---

## Table of Contents

1. [Auth](#1-auth)
2. [Agent](#2-agent)
3. [Territory](#3-territory)
4. [Wallet](#4-wallet)
5. [KYC](#5-kyc)
6. [Session](#6-session)
7. [Notification](#7-notification)
8. [Jueteng Config](#8-jueteng-config)
9. [Draw Schedule](#9-draw-schedule)
10. [Jueteng Draw](#10-jueteng-draw)
11. [Jueteng Bet](#11-jueteng-bet)
12. [Jueteng Payout](#12-jueteng-payout)
13. [Commission](#13-commission)
14. [Template](#14-template)
15. [Docs](#15-docs)
16. [Health](#16-health-checks)
17. [Common Query Parameters](#common-query-parameters)

---

## 1. Auth

> Registration, login, token management, OTP verification, and user profile.
> Rate-limited endpoints (10 req / 15 min). No global `verifyToken` — per-endpoint auth.

### Endpoints

| #   | Method | Path                        | Description                                                                                                                                            |  Auth   |
| --- | ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | :-----: |
| 1   | `POST` | `/api/auth/register`        | Register a new PLAYER or AGENT account. Creates Person, User, Wallet, and Session. Returns JWT access token in httpOnly cookie.                        |   No    |
| 2   | `POST` | `/api/auth/login`           | Authenticate with email + password. Returns access & refresh tokens as httpOnly cookies. Updates `lastLogin` timestamp.                                |   No    |
| 3   | `POST` | `/api/auth/logout`          | Invalidate the current session. Clears `token` and `refreshToken` cookies. Deletes session record from DB.                                             |   No    |
| 4   | `POST` | `/api/auth/refresh`         | Exchange a valid refresh token (from cookie or body) for a new access token. Rotates the refresh token and session.                                    |   No    |
| 5   | `POST` | `/api/auth/change-password` | Change the authenticated user's password. Requires current password verification.                                                                      | **Yes** |
| 6   | `GET`  | `/api/auth/me`              | Get the current authenticated user's full profile including person details, wallet, KYC status, and agent info.                                        | **Yes** |
| 7   | `POST` | `/api/auth/otp/request`     | Request a one-time password sent via EMAIL or SMS. Used for registration, login, password reset, phone/email verification, or withdrawal confirmation. |   No    |
| 8   | `POST` | `/api/auth/otp/verify`      | Verify a previously requested OTP code. Marks OTP as verified and updates user verification flags.                                                     |   No    |

### Payloads

#### `POST /api/auth/register`

```json
{
	"email": "juan@example.com", // required — valid email
	"password": "StrongPass123!", // required — 8-128 chars, must have uppercase + lowercase + digit + special char
	"firstName": "Juan", // required — min 1 char
	"lastName": "Dela Cruz", // required — min 1 char
	"middleName": "Santos", // optional
	"phoneNumber": "+639171234567", // optional — E.164 format
	"userName": "juandc", // optional — min 3 chars, unique
	"role": "PLAYER" // optional — "PLAYER" | "AGENT", default: "PLAYER"
}
```

**Response (201):**

```json
{
	"status": "success",
	"data": {
		"user": {
			"id": "...",
			"email": "juan@example.com",
			"userName": "juandc",
			"role": "PLAYER",
			"isEmailVerified": false,
			"isPhoneVerified": false
		},
		"accessToken": "eyJ..."
	}
}
```

#### `POST /api/auth/login`

```json
{
	"email": "juan@example.com", // required — valid email
	"password": "StrongPass123!" // required — min 1 char
}
```

#### `POST /api/auth/change-password`

```json
{
	"currentPassword": "OldPass123!", // required — min 1 char
	"newPassword": "NewPass456!" // required — 8-128 chars, uppercase + lowercase + digit + special char
}
```

#### `POST /api/auth/otp/request`

```json
{
	"email": "juan@example.com", // optional — provide email OR phone (at least one required)
	"phone": "+639171234567", // optional — E.164 format
	"type": "EMAIL_VERIFICATION" // optional — default: "EMAIL_VERIFICATION"
}
```

**Type values:** `REGISTRATION` | `LOGIN` | `PASSWORD_RESET` | `PHONE_VERIFICATION` | `EMAIL_VERIFICATION` | `WITHDRAWAL`

#### `POST /api/auth/otp/verify`

```json
{
	"email": "juan@example.com", // optional — provide email OR phone (at least one required)
	"phone": "+639171234567", // optional — E.164 format
	"code": "482910", // required — min 4 chars
	"type": "EMAIL_VERIFICATION" // required — same type values as request
}
```

#### `POST /api/auth/refresh`

```json
{
	"refreshToken": "eyJ..." // optional — can also come from httpOnly cookie
}
```

---

## 2. Agent

> Manage agents in the Jueteng network (Cobrador, Cabo, Operator, Capitalista, Pagador, Bolador).
> Each agent is linked to a User and optionally to a Territory and a supervisor Agent.

### Endpoints

| #   | Method   | Path             | Description                                                                      | Auth |
| --- | -------- | ---------------- | -------------------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/agent/:id` | Get a single agent by MongoDB ObjectId. Supports field selection via `?fields=`. | Yes  |
| 2   | `GET`    | `/api/agent`     | List all agents with pagination, filtering, sorting, grouping.                   | Yes  |
| 3   | `POST`   | `/api/agent`     | Create a new agent record linked to an existing user.                            | Yes  |
| 4   | `PATCH`  | `/api/agent/:id` | Partially update an agent (e.g. change role, territory, status).                 | Yes  |
| 5   | `DELETE` | `/api/agent/:id` | Permanently delete an agent record.                                              | Yes  |

### Payloads

#### `POST /api/agent`

```json
{
	"userId": "507f1f77bcf86cd799439011", // required — ObjectId of existing User
	"role": "COBRADOR", // required — "COBRADOR" | "CABO" | "OPERATOR" | "CAPITALISTA" | "PAGADOR" | "BOLADOR"
	"territoryId": "507f1f77bcf86cd799439012", // optional — territory assignment
	"supervisorId": "507f1f77bcf86cd799439013", // optional — supervising agent (Cabo)
	"commissionRate": 0.15, // optional — 0 to 1 (15% = 0.15), overrides global config
	"status": "ACTIVE", // optional — "ACTIVE" | "SUSPENDED" | "INACTIVE"
	"isActive": true // optional
}
```

#### `PATCH /api/agent/:id`

All fields from create are optional (partial update).

---

## 3. Territory

> Geographic areas (barangays, municipalities) managed by Cabos and their Cobradors.

### Endpoints

| #   | Method   | Path                 | Description                                               | Auth |
| --- | -------- | -------------------- | --------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/territory/:id` | Get a single territory by ID.                             | Yes  |
| 2   | `GET`    | `/api/territory`     | List all territories with pagination, filtering, sorting. | Yes  |
| 3   | `POST`   | `/api/territory`     | Create a new territory.                                   | Yes  |
| 4   | `PATCH`  | `/api/territory/:id` | Partially update territory details.                       | Yes  |
| 5   | `DELETE` | `/api/territory/:id` | Permanently delete a territory.                           | Yes  |

### Payloads

#### `POST /api/territory`

```json
{
	"name": "Brgy. San Antonio", // required — min 1 char
	"barangay": "San Antonio", // optional
	"municipality": "Makati", // optional
	"province": "Metro Manila", // optional
	"region": "NCR", // optional
	"isActive": true // optional
}
```

---

## 4. Wallet

> User wallets holding PHP balances. One wallet per user, created automatically on registration.

### Endpoints

| #   | Method   | Path              | Description                                                                 | Auth |
| --- | -------- | ----------------- | --------------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/wallet/:id` | Get a single wallet by ID.                                                  | Yes  |
| 2   | `GET`    | `/api/wallet`     | List all wallets with pagination, filtering, sorting.                       | Yes  |
| 3   | `POST`   | `/api/wallet`     | Create a new wallet (admin use — wallets are auto-created on registration). | Yes  |
| 4   | `PATCH`  | `/api/wallet/:id` | Update wallet (e.g. adjust balance, change status).                         | Yes  |
| 5   | `DELETE` | `/api/wallet/:id` | Permanently delete a wallet.                                                | Yes  |

### Payloads

#### `POST /api/wallet`

```json
{
	"userId": "507f1f77bcf86cd799439011", // required — owner User ObjectId
	"balance": 0, // optional — default: 0
	"bonus": 0, // optional — default: 0
	"currency": "PHP", // optional — default: "PHP"
	"status": "ACTIVE" // optional — "ACTIVE" | "FROZEN" | "CLOSED"
}
```

---

## 5. KYC

> Know Your Customer identity verification. Users upload ID documents for admin review.

### Endpoints

| #   | Method   | Path           | Description                                                       | Auth |
| --- | -------- | -------------- | ----------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/kyc/:id` | Get a single KYC record by ID.                                    | Yes  |
| 2   | `GET`    | `/api/kyc`     | List all KYC records with pagination, filtering, sorting.         | Yes  |
| 3   | `POST`   | `/api/kyc`     | Submit a new KYC verification request with document upload URL.   | Yes  |
| 4   | `PATCH`  | `/api/kyc/:id` | Update KYC status (admin approval/rejection) or document details. | Yes  |
| 5   | `DELETE` | `/api/kyc/:id` | Permanently delete a KYC record.                                  | Yes  |

### Payloads

#### `POST /api/kyc`

```json
{
	"userId": "507f1f77bcf86cd799439011", // required — User ObjectId
	"documentType": "national_id", // required — type of ID document
	"documentUrl": "https://storage.example.com/...", // required — signed cloud storage URL
	"selfieUrl": "https://storage.example.com/...", // optional — selfie for face matching
	"status": "PENDING", // optional — "PENDING" | "APPROVED" | "REJECTED" | "REQUIRES_MORE_INFO"
	"reviewedBy": "507f1f77bcf86cd799439099", // optional — admin User ObjectId
	"notes": "Clear photo, approved." // optional — reviewer notes
}
```

---

## 6. Session

> JWT refresh token sessions. Created automatically on login/register. Used for token rotation and device tracking.

### Endpoints

| #   | Method   | Path               | Description                                                            | Auth |
| --- | -------- | ------------------ | ---------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/session/:id` | Get a single session by ID.                                            | Yes  |
| 2   | `GET`    | `/api/session`     | List all sessions with pagination, filtering, sorting.                 | Yes  |
| 3   | `POST`   | `/api/session`     | Create a new session (admin/internal use — sessions are auto-created). | Yes  |
| 4   | `PATCH`  | `/api/session/:id` | Update session details.                                                | Yes  |
| 5   | `DELETE` | `/api/session/:id` | Delete a session (force-logout a device).                              | Yes  |

### Payloads

#### `POST /api/session`

```json
{
	"userId": "507f1f77bcf86cd799439011", // required — User ObjectId
	"token": "eyJhbGciOiJIUzI1NiIs...", // required — JWT refresh token
	"ipAddress": "192.168.1.100", // optional — client IP
	"userAgent": "Mozilla/5.0...", // optional — browser/device info
	"expiresAt": "2026-02-25T00:00:00.000Z" // required — session expiry datetime
}
```

---

## 7. Notification

> Real-time notifications via Socket.io (IN_APP) and external channels (SMS, EMAIL, PUSH).
> Only returns notifications owned by the authenticated user.

### Endpoints

| #   | Method   | Path                             | Description                                                                                        | Auth |
| --- | -------- | -------------------------------- | -------------------------------------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/notification`              | Get all notifications for the current authenticated user. Supports pagination, filtering, sorting. | Yes  |
| 2   | `GET`    | `/api/notification/unread-count` | Get the count of unread (non-READ) notifications for the current user.                             | Yes  |
| 3   | `GET`    | `/api/notification/:id`          | Get a single notification by ID (ownership check enforced).                                        | Yes  |
| 4   | `POST`   | `/api/notification`              | Create and send a notification to a user. Emits Socket.io event if channel is IN_APP.              | Yes  |
| 5   | `PUT`    | `/api/notification/:id`          | Full update of a notification record.                                                              | Yes  |
| 6   | `PATCH`  | `/api/notification/:id/read`     | Mark a single notification as read (sets `readAt` and status to `READ`).                           | Yes  |
| 7   | `PATCH`  | `/api/notification/read-all`     | Mark all notifications for the current user as read.                                               | Yes  |
| 8   | `DELETE` | `/api/notification/:id`          | Delete a notification.                                                                             | Yes  |

### Payloads

#### `POST /api/notification`

```json
{
	"userId": "507f1f77bcf86cd799439011", // required — recipient User ObjectId
	"type": "DRAW_RESULT", // required — "SYSTEM" | "TRANSACTION" | "KYC_UPDATE" | "DRAW_RESULT" | "PAYOUT" | "SECURITY" | "COMMISSION"
	"title": "Draw #456 Result", // required — notification title
	"body": "You won 500 PHP!", // required — notification body text
	"channel": "IN_APP", // optional — "IN_APP" | "SMS" | "EMAIL" | "PUSH", default: "IN_APP"
	"metadata": { "drawId": "...", "amount": 500 } // optional — arbitrary JSON payload
}
```

#### `PUT /api/notification/:id`

```json
{
	"status": "READ", // optional — "PENDING" | "SENT" | "READ" | "FAILED"
	"readAt": "2026-02-18T10:30:00.000Z", // optional — datetime
	"sentAt": "2026-02-18T10:00:00.000Z" // optional — datetime
}
```

---

## 8. Jueteng Config

> Global game configuration — one active config record at a time.
> Controls number ranges, payout multiplier, bet limits, and commission rates.

### Endpoints

| #   | Method   | Path                     | Description                                                       | Auth |
| --- | -------- | ------------------------ | ----------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/juetengConfig/:id` | Get a config record by ID.                                        | Yes  |
| 2   | `GET`    | `/api/juetengConfig`     | List all config records (typically only one is active).           | Yes  |
| 3   | `POST`   | `/api/juetengConfig`     | Create a new game config (usually to supersede the old one).      | Yes  |
| 4   | `PATCH`  | `/api/juetengConfig/:id` | Update config values (e.g. adjust payout multiplier, bet limits). | Yes  |
| 5   | `DELETE` | `/api/juetengConfig/:id` | Delete a config record.                                           | Yes  |

### Payloads

#### `POST /api/juetengConfig`

```json
{
	"maxNumber": 37, // optional — highest ball in tambiolo (default: 37)
	"allowRepeat": true, // optional — can same number appear twice (default: true)
	"payoutMultiplier": 500, // optional — winner gets stake × this (default: 500×)
	"minBet": 1, // optional — minimum bet in PHP (positive)
	"maxBet": 1000, // optional — maximum bet in PHP (positive)
	"cobradorRate": 0.15, // optional — 0-1, cobrador commission rate (15%)
	"caboRate": 0.05, // optional — 0-1, cabo bonus rate (5%)
	"capitalistaRate": 0.25, // optional — 0-1, capitalista rate (25%)
	"currency": "PHP", // optional
	"isActive": true // optional
}
```

---

## 9. Draw Schedule

> Recurring daily draw schedule templates (MORNING at 11:00 AM, AFTERNOON at 4:00 PM Manila time).
> Each schedule spawns daily `JuetengDraw` instances.

### Endpoints

| #   | Method   | Path                    | Description                                           | Auth |
| --- | -------- | ----------------------- | ----------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/drawSchedule/:id` | Get a single draw schedule by ID.                     | Yes  |
| 2   | `GET`    | `/api/drawSchedule`     | List all draw schedules.                              | Yes  |
| 3   | `POST`   | `/api/drawSchedule`     | Create a new draw schedule (MORNING or AFTERNOON).    | Yes  |
| 4   | `PATCH`  | `/api/drawSchedule/:id` | Update schedule (change time, cutoff, active status). | Yes  |
| 5   | `DELETE` | `/api/drawSchedule/:id` | Delete a draw schedule.                               | Yes  |

### Payloads

#### `POST /api/drawSchedule`

```json
{
	"drawType": "MORNING", // required — "MORNING" | "AFTERNOON"
	"scheduledTime": "11:00", // required — 24h format (e.g. "11:00", "16:00")
	"cutoffMinutes": 5, // optional — minutes before draw to stop bets (default: 5)
	"timeZone": "Asia/Manila", // optional — default: "Asia/Manila"
	"isActive": true // optional
}
```

---

## 10. Jueteng Draw

> A single draw instance created per schedule per day. Tracks draw lifecycle from SCHEDULED → OPEN → CLOSED → DRAWN → SETTLED.

### Endpoints

| #   | Method   | Path                   | Description                                                            | Auth |
| --- | -------- | ---------------------- | ---------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/juetengDraw/:id` | Get a single draw by ID (includes bets, payouts, commissions).         | Yes  |
| 2   | `GET`    | `/api/juetengDraw`     | List all draws with pagination, filtering (by date, status, type).     | Yes  |
| 3   | `POST`   | `/api/juetengDraw`     | Create a new draw instance for a schedule.                             | Yes  |
| 4   | `PATCH`  | `/api/juetengDraw/:id` | Update draw (enter winning numbers, change status, record settlement). | Yes  |
| 5   | `DELETE` | `/api/juetengDraw/:id` | Delete a draw record.                                                  | Yes  |

### Payloads

#### `POST /api/juetengDraw`

```json
{
	"scheduleId": "507f1f77bcf86cd799439011", // required — DrawSchedule ObjectId
	"drawDate": "2026-02-18T00:00:00.000Z", // required — date of the draw
	"drawType": "MORNING", // required — "MORNING" | "AFTERNOON"
	"scheduledAt": "2026-02-18T11:00:00.000Z", // required — exact draw datetime
	"status": "SCHEDULED", // optional — "SCHEDULED" | "OPEN" | "CLOSED" | "DRAWN" | "SETTLED" | "CANCELLED"
	"openedAt": "2026-02-18T08:00:00.000Z", // optional — when betting opened
	"closedAt": "2026-02-18T10:55:00.000Z", // optional — when betting closed
	"drawnAt": "2026-02-18T11:00:00.000Z", // optional — when tambiolo was operated
	"settledAt": "2026-02-18T11:15:00.000Z", // optional — when payouts completed
	"number1": 5, // optional — first drawn ball (int)
	"number2": 12, // optional — second drawn ball (int)
	"combinationKey": "5-12", // optional — sorted "min-max" key
	"boladorId": "507f1f77bcf86cd799439022", // optional — Agent (BOLADOR) who operated
	"totalBets": 0, // optional — count of bets (int)
	"totalStake": 0, // optional — total PHP wagered
	"totalPayout": 0, // optional — total PHP paid out
	"grossProfit": 0 // optional — totalStake - totalPayout
}
```

---

## 11. Jueteng Bet

> Individual bets placed by players (bettors) through cobradors on a specific draw.
> Player picks two numbers from 1 to `maxNumber` (default 37).

### Endpoints

| #   | Method   | Path                  | Description                                                         | Auth |
| --- | -------- | --------------------- | ------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/juetengBet/:id` | Get a single bet by ID.                                             | Yes  |
| 2   | `GET`    | `/api/juetengBet`     | List all bets with pagination, filtering (by draw, bettor, status). | Yes  |
| 3   | `POST`   | `/api/juetengBet`     | Place a new bet on an open draw.                                    | Yes  |
| 4   | `PATCH`  | `/api/juetengBet/:id` | Update bet (settle as WON/LOST/VOID, set payout amount).            | Yes  |
| 5   | `DELETE` | `/api/juetengBet/:id` | Delete a bet record.                                                | Yes  |

### Payloads

#### `POST /api/juetengBet`

```json
{
	"drawId": "507f1f77bcf86cd799439011", // required — JuetengDraw ObjectId
	"bettorId": "507f1f77bcf86cd799439022", // required — User (player) ObjectId
	"cobradorId": "507f1f77bcf86cd799439033", // required — Agent (COBRADOR) who collected the bet
	"caboId": "507f1f77bcf86cd799439044", // optional — Agent (CABO) supervising the cobrador
	"number1": 5, // required — first chosen number (int, min 1)
	"number2": 12, // required — second chosen number (int, min 1)
	"combinationKey": "5-12", // required — sorted "min-max" key for fast lookup
	"amount": 10, // required — stake in PHP (positive)
	"currency": "PHP", // optional — default: "PHP"
	"status": "PENDING", // optional — "PENDING" | "WON" | "LOST" | "VOID" | "REFUNDED"
	"isWinner": false, // optional
	"payoutAmount": null, // optional — amount × payoutMultiplier if won
	"reference": "20260218-MRN-00001" // required — unique bet reference string
}
```

---

## 12. Jueteng Payout

> Payout records for winning bets. Created during draw settlement. Tracked through PENDING → PAID → CLAIMED lifecycle.

### Endpoints

| #   | Method   | Path                     | Description                                                            | Auth |
| --- | -------- | ------------------------ | ---------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/juetengPayout/:id` | Get a single payout by ID.                                             | Yes  |
| 2   | `GET`    | `/api/juetengPayout`     | List all payouts with pagination, filtering (by draw, bettor, status). | Yes  |
| 3   | `POST`   | `/api/juetengPayout`     | Create a payout record for a winning bet.                              | Yes  |
| 4   | `PATCH`  | `/api/juetengPayout/:id` | Update payout (mark as PAID/CLAIMED, assign pagador).                  | Yes  |
| 5   | `DELETE` | `/api/juetengPayout/:id` | Delete a payout record.                                                | Yes  |

### Payloads

#### `POST /api/juetengPayout`

```json
{
	"betId": "507f1f77bcf86cd799439011", // required — winning JuetengBet ObjectId
	"drawId": "507f1f77bcf86cd799439022", // required — JuetengDraw ObjectId
	"bettorId": "507f1f77bcf86cd799439033", // required — winning User ObjectId
	"pagadorId": "507f1f77bcf86cd799439044", // optional — Agent (PAGADOR) who will deliver cash
	"amount": 5000, // required — payout amount in PHP (positive)
	"currency": "PHP", // optional — default: "PHP"
	"status": "PENDING", // optional — "PENDING" | "PAID" | "CLAIMED" | "FAILED" | "CANCELLED"
	"paidAt": "2026-02-18T12:00:00.000Z", // optional — when pagador paid
	"claimedAt": "2026-02-18T12:30:00.000Z", // optional — when bettor confirmed receipt
	"notes": "Paid in cash at Brgy. hall" // optional — pagador notes
}
```

---

## 13. Commission

> Commission records generated during draw settlement for agents (cobradors, cabos, capitalistas).

### Endpoints

| #   | Method   | Path                  | Description                                                             | Auth |
| --- | -------- | --------------------- | ----------------------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/commission/:id` | Get a single commission record by ID.                                   | Yes  |
| 2   | `GET`    | `/api/commission`     | List all commissions with pagination, filtering (by agent, draw, type). | Yes  |
| 3   | `POST`   | `/api/commission`     | Create a commission record (generated during settlement).               | Yes  |
| 4   | `PATCH`  | `/api/commission/:id` | Update commission (mark as PAID).                                       | Yes  |
| 5   | `DELETE` | `/api/commission/:id` | Delete a commission record.                                             | Yes  |

### Payloads

#### `POST /api/commission`

```json
{
	"agentId": "507f1f77bcf86cd799439011", // required — Agent ObjectId
	"drawId": "507f1f77bcf86cd799439022", // required — JuetengDraw ObjectId
	"type": "COLLECTION", // required — "COLLECTION" | "WINNER_BONUS" | "CAPITALISTA" | "FIXED"
	"rate": 0.15, // required — commission rate (0-1)
	"baseAmount": 10000, // required — amount the rate was applied to (min 0)
	"amount": 1500, // required — actual commission earned: baseAmount × rate (min 0)
	"status": "PENDING" // optional — "PENDING" | "PAID" | "CANCELLED"
}
```

**Commission Types:**
| Type | Description | Typical Rate |
|------|-------------|:------------:|
| `COLLECTION` | % of total stake collected by cobrador | 15% |
| `WINNER_BONUS` | % of winner payout paid to cabo | 5% |
| `CAPITALISTA` | % of total collections to financier | 25% |
| `FIXED` | Fixed salary for bolador / pagador | — |

---

## 14. Template

> Generic CRUD template model used for testing and scaffolding.

### Endpoints

| #   | Method   | Path                | Description                                             | Auth |
| --- | -------- | ------------------- | ------------------------------------------------------- | :--: |
| 1   | `GET`    | `/api/template/:id` | Get a template by ID.                                   | Yes  |
| 2   | `GET`    | `/api/template`     | List all templates with pagination, filtering, sorting. | Yes  |
| 3   | `POST`   | `/api/template`     | Create a new template.                                  | Yes  |
| 4   | `PATCH`  | `/api/template/:id` | Update a template.                                      | Yes  |
| 5   | `DELETE` | `/api/template/:id` | Delete a template.                                      | Yes  |

### Payloads

#### `POST /api/template`

```json
{
	"name": "My Template", // required — min 1 char
	"description": "A test entry", // optional
	"type": "default", // optional
	"isDeleted": false // optional — default: false
}
```

---

## 15. Docs

> Auto-generated API documentation. No authentication required.

### Endpoints

| #   | Method | Path                 | Description                                                                                                        | Auth |
| --- | ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------ | :--: |
| 1   | `GET`  | `/api/docs/api-list` | Get all registered API endpoints as JSON or plain text. Filterable by `?tag=` and `?method=`.                      |  No  |
| 2   | `GET`  | `/api/docs/swagger`  | Get the OpenAPI 3.0 specification (JSON).                                                                          |  No  |
| 3   | `GET`  | `/api/docs/postman`  | Get a Postman collection export (JSON).                                                                            |  No  |
| 4   | `GET`  | `/api/docs/iml`      | Generate IML (Integration Markup Language) files. Filterable by `?tag=`. Supports `?format=json` or `?format=xml`. |  No  |

> **Swagger UI** is also available at `/api/swagger` (development only).

---

## 16. Health Checks

> System health endpoints. No authentication required.

| #   | Method | Path            | Description                                                           |
| --- | ------ | --------------- | --------------------------------------------------------------------- |
| 1   | `GET`  | `/`             | Basic health check — returns status, timestamp, uptime.               |
| 2   | `GET`  | `/health`       | Enhanced health check with SLA monitoring status.                     |
| 3   | `GET`  | `/health/redis` | Redis connectivity check — returns latency, memory usage, total keys. |

---

## Common Query Parameters

All standard CRUD modules (2–14) share these query parameters on `GET /` list endpoints:

### Pagination & Sorting

| Parameter | Type    | Default     | Description                             |
| --------- | ------- | ----------- | --------------------------------------- |
| `page`    | integer | `1`         | Page number (min: 1)                    |
| `limit`   | integer | `10`        | Records per page (min: 1, max: 100)     |
| `order`   | string  | `desc`      | Sort direction: `asc` or `desc`         |
| `sort`    | string  | `createdAt` | Sort field name, or JSON for multi-sort |

### Filtering & Search

| Parameter | Type        | Description                                                                      |
| --------- | ----------- | -------------------------------------------------------------------------------- |
| `query`   | string      | Full-text search on name/description fields                                      |
| `filter`  | JSON string | Array of filter objects: `[{"field":"status","operator":"eq","value":"ACTIVE"}]` |
| `fields`  | string      | Comma-separated field projection (dot notation supported): `id,email,role`       |

### Grouping & Metadata

| Parameter    | Type     | Description                                                          |
| ------------ | -------- | -------------------------------------------------------------------- |
| `groupBy`    | string   | Group results by a field (e.g. `status`, `role`)                     |
| `document`   | `"true"` | Include full document data in results                                |
| `pagination` | `"true"` | Include pagination metadata (`totalPages`, `currentPage`, `hasNext`) |
| `count`      | `"true"` | Include total record count                                           |

### Single Record (GET /:id)

| Parameter        | Type   | Description                                           |
| ---------------- | ------ | ----------------------------------------------------- |
| `id` (path)      | string | MongoDB ObjectId — 24 hex chars (`^[0-9a-fA-F]{24}$`) |
| `fields` (query) | string | Comma-separated field selection                       |

---

## Endpoint Summary

| Module         | Prefix               | Endpoints | Auth  |
| -------------- | -------------------- | :-------: | :---: |
| Auth           | `/api/auth`          |     8     | Mixed |
| Agent          | `/api/agent`         |     5     |  Yes  |
| Territory      | `/api/territory`     |     5     |  Yes  |
| Wallet         | `/api/wallet`        |     5     |  Yes  |
| KYC            | `/api/kyc`           |     5     |  Yes  |
| Session        | `/api/session`       |     5     |  Yes  |
| Notification   | `/api/notification`  |     8     |  Yes  |
| Jueteng Config | `/api/juetengConfig` |     5     |  Yes  |
| Draw Schedule  | `/api/drawSchedule`  |     5     |  Yes  |
| Jueteng Draw   | `/api/juetengDraw`   |     5     |  Yes  |
| Jueteng Bet    | `/api/juetengBet`    |     5     |  Yes  |
| Jueteng Payout | `/api/juetengPayout` |     5     |  Yes  |
| Commission     | `/api/commission`    |     5     |  Yes  |
| Template       | `/api/template`      |     5     |  Yes  |
| Docs           | `/api/docs`          |     4     |  No   |
| Health         | `/`, `/health`       |     3     |  No   |
| **Total**      |                      |  **88**   |       |
