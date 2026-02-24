import { PrismaClient } from "../../generated/prisma";
import { seedConfig } from "./configSeeder";

const prisma = new PrismaClient();

export async function seedJuetengData() {
  console.log("Seeding Jueteng data...");

  // ── Config + Draw schedules (delegated to configSeeder — idempotent) ──────────
  await seedConfig();

  // Retrieve schedules for draw instance creation
  const morningSchedule = await prisma.drawSchedule.findFirst({ where: { drawType: "MORNING" } });
  const afternoonSchedule = await prisma.drawSchedule.findFirst({ where: { drawType: "AFTERNOON" } });

  if (!morningSchedule || !afternoonSchedule) {
    console.error("❌ Schedules not found after seeding — cannot create draws.");
    return;
  }

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
  console.log(`  Territory: ${territory.name}, ${territory.province}`);
  console.log("  Draws: 2 created for today (MORNING + AFTERNOON)");
}
