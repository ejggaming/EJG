# Jueteng Platform — System Documentation

## What is Jueteng?

A traditional Filipino numbers game introduced during Spanish colonization.
Players pick **2 numbers from 1–37**. Two balls are drawn from a **tambiolo**
(barrel drum) twice daily. Matching both numbers **in any order** wins a
configurable payout multiplier (default **500×** stake).

> **Note:** Jueteng is illegal in the Philippines under Act No. 1757 (1907).
> This platform is for educational/simulation purposes only.

---

## Game Mechanics

| Rule               | Value / Description                                   |
|--------------------|-------------------------------------------------------|
| Number range       | 1–37 (configurable via `JuetengConfig.maxNumber`)     |
| Numbers per bet    | 2                                                     |
| Order matters?     | No — (5, 12) = (12, 5)                                |
| Repeats allowed?   | Yes — same number can appear twice (configurable)     |
| Draws per day      | 2 — Morning (11:00) and Afternoon (16:00) Asia/Manila |
| Default payout     | 500× stake                                            |
| Currency           | PHP                                                   |

---

## Agent Hierarchy

```
Capitalista (financier/backer)
  └── Operator (territory maintainer)
        └── Cabo (cobrador supervisor)
              └── Cobrador/Kubrador (bet collector)

Bolador  — tambiolo draw operator (independent)
Pagador  — cash payout agent (independent)
```

### Commission Structure

| Role        | Rate               | Applied To                  |
|-------------|--------------------|-----------------------------|
| Cobrador    | 15% (cobradorRate) | Total stake collected        |
| Cabo        | 5%  (caboRate)     | Winner payout amounts        |
| Capitalista | 25% (capitalistaRate) | Total collections         |
| Bolador     | Fixed salary       | N/A                         |
| Pagador     | Fixed salary       | N/A                         |

---

## Game Flow

```
1. Admin creates JuetengDraw for today (via DrawSchedule)
2. Draw status → OPEN  (bets accepted)
3. Cobrador collects bets → JuetengBet records saved
4. cutoffMinutes before draw → status → CLOSED
5. Bolador runs tambiolo → number1 & number2 recorded → status → DRAWN
6. System computes combinationKey (sorted "min-max" e.g. "5-12")
7. All bets with matching combinationKey → isWinner = true
8. JuetengPayout records created for winners
9. DrawCommission records calculated for all agents
10. Pagador pays winners → status → CLAIMED
11. Draw status → SETTLED
```

---

## Schema Files

| File | Models |
|---|---|
| `jueteng-config.prisma` | `JuetengConfig` |
| `draw-schedule.prisma` | `DrawSchedule` + `DrawType` enum |
| `jueteng-draw.prisma` | `JuetengDraw` + `DrawStatus` enum |
| `territory.prisma` | `Territory` |
| `agent.prisma` | `Agent` + `AgentRole` + `AgentStatus` enums |
| `jueteng-bet.prisma` | `JuetengBet` + `JuetengBetStatus` enum |
| `commission.prisma` | `DrawCommission` + `CommissionType` + `CommissionStatus` enums |
| `jueteng-payout.prisma` | `JuetengPayout` + `PayoutStatus` enum |

---

## Key Config Fields (`JuetengConfig`)

| Field              | Default | Description                          |
|--------------------|---------|--------------------------------------|
| `maxNumber`        | 37      | Highest ball in tambiolo             |
| `allowRepeat`      | true    | Same number can appear twice         |
| `payoutMultiplier` | 500     | Winner payout = stake × multiplier   |
| `minBet`           | 1       | Minimum bet in PHP                   |
| `maxBet`           | 1000    | Maximum bet in PHP                   |
| `cobradorRate`     | 0.15    | 15% of stake to collector            |
| `caboRate`         | 0.05    | 5% of winner payout to supervisor    |
| `capitalistaRate`  | 0.25    | 25% of total collections to financier|

---

## Winner Settlement Logic

```typescript
// Build a sorted combination key for O(1) winner lookup
function buildCombinationKey(n1: number, n2: number): string {
  return [n1, n2].sort((a, b) => a - b).join("-");
}

// On draw settlement:
const drawnKey = buildCombinationKey(number1, number2);
// Query: find all bets where combinationKey === drawnKey
// Mark isWinner = true, create JuetengPayout for each
```

---

## Running the Seed

```bash
npm run prisma-generate
npm run prisma-seed
```

Seeds: config, morning/afternoon draw schedules, a territory, and today's 2 draws.

---

## Running Tests

```bash
npm test -- --grep "Jueteng"
```
