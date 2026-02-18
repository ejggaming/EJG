# Test Execution Report — 2026-02-18

## Summary

| Metric              | Value                                      |
| ------------------- | ------------------------------------------ |
| **Total Endpoints** | 93                                         |
| **Build**           | FAIL (103 errors)                          |
| **Tests**           | BLOCKED (build fails before tests can run) |
| **Lint**            | FAIL (missing `lib-entry.ts` reference)    |
| **Coverage**        | N/A — unable to run                        |
| **Decision**        | **NO-GO**                                  |

## 1. Scope and Environment

- **Project**: betting-app backend (msa-template-1bis v1.0.122)
- **Stack**: Express 5 + Prisma 6 (MongoDB) + TypeScript 5.8
- **Test Runner**: Mocha + Chai + Supertest
- **Build Tool**: Webpack 5.105
- **Date**: 2026-02-18

## 2. Commands Executed

| Command         | Result                                                   |
| --------------- | -------------------------------------------------------- |
| `npm run build` | **FAIL** — 103 TypeScript errors across 16 controllers   |
| `npm run test`  | **FAIL** — Mocha aborts at compile time due to TS errors |
| `npm run lint`  | **FAIL** — ESLint aborts: `lib-entry.ts` not found       |

## 3. Build Error Breakdown

| Error Code | Count  | Description                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------- |
| TS2339     | 57     | Property does not exist on type (controller references fields not in Prisma model) |
| TS2322     | 19     | Type assignment mismatch (create/update input types don't match Prisma schema)     |
| TS2353     | 13     | Object literal specifies unknown properties (e.g., `isDeleted` not in WhereInput)  |
| **Total**  | **89** | (103 total webpack errors, 89 unique TS diagnostics)                               |

### Affected Files (16 of 17 controllers)

| Controller                  | Error Count | Root Cause                                                                  |
| --------------------------- | ----------- | --------------------------------------------------------------------------- |
| agent.controller.ts         | 7           | Template-generated fields (name, description, isDeleted) not in Agent model |
| bet.controller.ts           | 8           | `prisma.bet` does not exist — model name mismatch                           |
| commission.controller.ts    | 5+          | `prisma.commission` does not exist — model name mismatch                    |
| sport.controller.ts         | 7           | Template fields not in Sport model                                          |
| event.controller.ts         | 7           | Template fields not in Event model                                          |
| market.controller.ts        | 7           | Template fields not in Market model                                         |
| wallet.controller.ts        | 5           | Template fields not in Wallet model                                         |
| promotion.controller.ts     | 7           | Template fields not in Promotion model                                      |
| kyc.controller.ts           | 7           | Template fields not in KYC model                                            |
| session.controller.ts       | 7           | Template fields not in Session model                                        |
| territory.controller.ts     | 7           | Template fields not in Territory model                                      |
| drawSchedule.controller.ts  | 7           | Template fields not in DrawSchedule model                                   |
| juetengDraw.controller.ts   | 7           | Template fields not in JuetengDraw model                                    |
| juetengBet.controller.ts    | 7           | Template fields not in JuetengBet model                                     |
| juetengConfig.controller.ts | 7           | Template fields not in JuetengConfig model                                  |
| juetengPayout.controller.ts | 7           | Template fields not in JuetengPayout model                                  |

**Only `template.controller.ts` compiles cleanly** — all other controllers were scaffolded from the template but not updated to match their actual Prisma model fields.

## 4. Root Cause Analysis

All 16 failing controllers share the same pattern — they were generated from `template.controller.ts` which has fields like `name`, `description`, `type`, and `isDeleted`. When the Prisma schema was updated with model-specific fields (e.g., Agent has `userId`, `role`, `commissionRate`), the controllers were **not regenerated or updated** to match.

### Two distinct error categories:

1. **Field mismatch (14 controllers)**: Controllers reference `name`, `description`, `type`, `isDeleted` but the Prisma model has different fields (e.g., Agent has `userId`, `role`, `commissionRate`, `status`).

2. **Model name mismatch (2 controllers)**: `bet.controller.ts` and `commission.controller.ts` use `prisma.bet` and `prisma.commission` but the generated Prisma client doesn't expose these models — likely the Prisma model names differ (e.g., `Bet` vs `bet` casing issue, or the model isn't defined).

## 5. Lint Issue

The `npm run lint` script in package.json references `lib-entry.ts`:

```
"lint": "eslint app/**/*.ts index.ts lib-entry.ts"
```

The file `lib-entry.ts` does not exist, causing ESLint to abort entirely.

## 6. Endpoint Status Summary

| Category                                           | Count  | Status                          |
| -------------------------------------------------- | ------ | ------------------------------- |
| Health endpoints (`/`, `/health`, `/health/redis`) | 3      | OK (no TS errors)               |
| Swagger UI (`/api/swagger`)                        | 1      | OK (dev only)                   |
| Docs endpoints (`/api/docs/*`)                     | 4      | OK                              |
| Template CRUD (`/api/template/*`)                  | 5      | OK (compiles clean)             |
| All other CRUD endpoints                           | 80     | **FAIL** — blocked by TS errors |
| **Total**                                          | **93** | **13 OK / 80 FAIL**             |

## 7. Defect Summary

See `TEST_DEFECTS_2026-02-18.csv` for full list.

| Severity  | Count  |
| --------- | ------ |
| CRITICAL  | 21     |
| MEDIUM    | 1      |
| **Total** | **22** |

## 8. Recommendations

### Immediate (P0 — blocks all testing):

1. **Regenerate controllers** from template for each module, updating field references to match actual Prisma model fields
2. **Run `npx prisma generate`** to ensure the Prisma client is up to date
3. **Verify model names** in Prisma schema match what controllers expect (check `bet.prisma` and `commission.prisma` model declarations)
4. **Fix lint script** — remove or restore `lib-entry.ts` reference in package.json

### After fix:

5. Re-run `npm run build` — target 0 errors
6. Re-run `npm run test` — validate all test suites pass
7. Re-run `npm run lint` — confirm clean lint
8. Generate coverage report

## 9. Go / No-Go Decision

### **NO-GO** ❌

**Rationale**: 80 of 93 endpoints (86%) are blocked by TypeScript compilation errors. The build fails with 103 errors across 16 of 17 feature controllers. Tests cannot execute. No endpoint can be verified as functionally working except the template CRUD, health checks, and docs routes.

**Blocking issues**: 22 defects, 21 CRITICAL severity.

**Next step**: Fix the controller/schema mismatch issue, then re-invoke the full pipeline.
