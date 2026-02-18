import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedJuetengData() {
  console.log("Seeding Jueteng data...");

  // ── Config ───────────────────────────────────────────────────────────────────
  await prisma.juetengConfig.create({
    data: {
      maxNumber: 37,
      allowRepeat: true,
      payoutMultiplier: 500,
      minBet: 1,
      maxBet: 1000,
      cobradorRate: 0.15,
      caboRate: 0.05,
      capitalistaRate: 0.25,
      currency: "PHP",
      isActive: true,
    },
  });

  // ── Draw schedules ────────────────────────────────────────────────────────────
  const morningSchedule = await prisma.drawSchedule.create({
    data: {
      drawType: "MORNING",
      scheduledTime: "11:00",
      cutoffMinutes: 5,
      timeZone: "Asia/Manila",
      isActive: true,
    },
  });

  const afternoonSchedule = await prisma.drawSchedule.create({
    data: {
      drawType: "AFTERNOON",
      scheduledTime: "16:00",
      cutoffMinutes: 5,
      timeZone: "Asia/Manila",
      isActive: true,
    },
  });

  // ── Territory ─────────────────────────────────────────────────────────────────
  const territory = await prisma.territory.create({
    data: {
      name: "Brgy. San Jose",
      barangay: "San Jose",
      municipality: "Malolos",
      province: "Bulacan",
      region: "Region III",
      isActive: true,
    },
  });

  // ── Today's draws ─────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.juetengDraw.create({
    data: {
      scheduleId: morningSchedule.id,
      drawDate: today,
      drawType: "MORNING",
      status: "OPEN",
      scheduledAt: new Date(today.getTime() + 11 * 3600000),
    },
  });

  await prisma.juetengDraw.create({
    data: {
      scheduleId: afternoonSchedule.id,
      drawDate: today,
      drawType: "AFTERNOON",
      status: "SCHEDULED",
      scheduledAt: new Date(today.getTime() + 16 * 3600000),
    },
  });

  console.log("Jueteng seed complete:");
  console.log("  Config: payoutMultiplier=500×, maxNumber=37");
  console.log("  Schedules: MORNING 11:00, AFTERNOON 16:00");
  console.log(`  Territory: ${territory.name}, ${territory.province}`);
  console.log("  Draws: 2 created for today");
}
