import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedBettingData() {
  console.log("Seeding betting data...");

  // ── Sports ───────────────────────────────────────────────────────────────────
  const football = await prisma.sport.upsert({
    where: { code: "FOOTBALL" },
    update: {},
    create: { name: "Football", code: "FOOTBALL", isActive: true, sortOrder: 1 },
  });

  const basketball = await prisma.sport.upsert({
    where: { code: "BASKETBALL" },
    update: {},
    create: { name: "Basketball", code: "BASKETBALL", isActive: true, sortOrder: 2 },
  });

  // ── Competitions ─────────────────────────────────────────────────────────────
  const premierLeague = await prisma.competition.upsert({
    where: { code: "EPL" },
    update: {},
    create: {
      sportId: football.id,
      name: "Premier League",
      code: "EPL",
      country: "England",
      isActive: true,
    },
  });

  const nba = await prisma.competition.upsert({
    where: { code: "NBA" },
    update: {},
    create: {
      sportId: basketball.id,
      name: "NBA",
      code: "NBA",
      country: "USA",
      isActive: true,
    },
  });

  // ── Teams ────────────────────────────────────────────────────────────────────
  const [arsenal, chelsea] = await Promise.all([
    prisma.team.create({
      data: { competitionId: premierLeague.id, name: "Arsenal", shortName: "ARS", country: "England" },
    }),
    prisma.team.create({
      data: { competitionId: premierLeague.id, name: "Chelsea", shortName: "CHE", country: "England" },
    }),
  ]);

  const [lakers, bulls] = await Promise.all([
    prisma.team.create({
      data: { competitionId: nba.id, name: "LA Lakers", shortName: "LAL", country: "USA" },
    }),
    prisma.team.create({
      data: { competitionId: nba.id, name: "Chicago Bulls", shortName: "CHI", country: "USA" },
    }),
  ]);

  // ── Events ───────────────────────────────────────────────────────────────────
  const footballEvent = await prisma.event.create({
    data: {
      competitionId: premierLeague.id,
      homeTeamId: arsenal.id,
      awayTeamId: chelsea.id,
      startTime: new Date(Date.now() + 86400000),
      status: "SCHEDULED",
      isLive: false,
    },
  });

  await prisma.event.create({
    data: {
      competitionId: nba.id,
      homeTeamId: lakers.id,
      awayTeamId: bulls.id,
      startTime: new Date(Date.now() + 172800000),
      status: "SCHEDULED",
      isLive: false,
    },
  });

  // ── Markets + Selections ──────────────────────────────────────────────────────
  const matchResultMarket = await prisma.market.create({
    data: { eventId: footballEvent.id, name: "Match Result", type: "MATCH_RESULT", status: "OPEN" },
  });

  await prisma.selection.createMany({
    data: [
      { marketId: matchResultMarket.id, name: "Arsenal Win", odds: 1.85, status: "ACTIVE" },
      { marketId: matchResultMarket.id, name: "Draw",        odds: 3.40, status: "ACTIVE" },
      { marketId: matchResultMarket.id, name: "Chelsea Win", odds: 4.20, status: "ACTIVE" },
    ],
  });

  const bttsMarket = await prisma.market.create({
    data: { eventId: footballEvent.id, name: "Both Teams to Score", type: "BTTS", status: "OPEN" },
  });

  await prisma.selection.createMany({
    data: [
      { marketId: bttsMarket.id, name: "Yes", odds: 1.65, status: "ACTIVE" },
      { marketId: bttsMarket.id, name: "No",  odds: 2.10, status: "ACTIVE" },
    ],
  });

  // ── Promotions ────────────────────────────────────────────────────────────────
  await prisma.promotion.createMany({
    data: [
      {
        code: "WELCOME100",
        name: "Welcome Bonus 100%",
        type: "DEPOSIT_MATCH",
        value: 100,
        minDeposit: 10,
        maxBonus: 100,
        wageringRequirement: 5,
        minOdds: 1.5,
        isActive: true,
      },
      {
        code: "FREEBET10",
        name: "Free Bet £10",
        type: "FREE_BET",
        value: 10,
        minDeposit: 20,
        wageringRequirement: 1,
        minOdds: 2.0,
        isActive: true,
      },
    ],
  });

  console.log("Betting data seeded:");
  console.log("  Sports: Football, Basketball");
  console.log("  Competitions: Premier League, NBA");
  console.log("  Teams: Arsenal, Chelsea, LA Lakers, Chicago Bulls");
  console.log("  Events: Arsenal vs Chelsea, Lakers vs Bulls");
  console.log("  Markets: Match Result, BTTS");
  console.log("  Promotions: WELCOME100, FREEBET10");
}
