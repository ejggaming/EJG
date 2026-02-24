import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

/**
 * Seeds the initial admin configuration:
 *  - JuetengConfig  (game rules, payout, commission rates)
 *  - DrawSchedule   (MORNING, AFTERNOON, EVENING recurring templates)
 *
 * Safe to run multiple times — uses upsert logic (skips if already exists).
 */
export async function seedConfig() {
	console.log("\n🔧 Seeding admin configuration...");

	// ── 1. Jueteng Game Config ─────────────────────────────────────────────────

	const existingConfig = await prisma.juetengConfig.findFirst({
		where: { isActive: true },
	});

	if (existingConfig) {
		console.log("⏭️  JuetengConfig already exists, skipping.");
	} else {
		await prisma.juetengConfig.create({
			data: {
				maxNumber:        37,     // pick 2 from 1–37
				allowRepeat:      false,  // both numbers must be different
				payoutMultiplier: 500,    // winner gets stake × 500
				minBet:           1,      // ₱1 minimum
				maxBet:           1000,   // ₱1,000 maximum per bet
				cobradorRate:     0.15,   // 15% of stake → collector agent
				caboRate:         0.05,   // 5% of stake → supervisor agent
				capitalistaRate:  0.25,   // 25% of stake → financier
				governmentRate:   0.0,    // 0% government share (configure via Settings)
				currency:         "PHP",
				isActive:         true,
			},
		});
		console.log("✅ JuetengConfig created.");
		console.log("   maxNumber=37 | payout=500× | minBet=₱1 | maxBet=₱1,000");
		console.log("   cobrador=15% | cabo=5% | capitalista=25% | gov=0%");
	}

	// ── 2. Draw Schedules ──────────────────────────────────────────────────────

	const scheduleConfigs = [
		{
			drawType:      "MORNING"   as const,
			scheduledTime: "11:00",   // 11:00 AM Asia/Manila
			cutoffMinutes: 15,        // stop accepting bets 15 min before draw
			timeZone:      "Asia/Manila",
			isActive:      true,
		},
		{
			drawType:      "AFTERNOON" as const,
			scheduledTime: "16:00",   // 4:00 PM Asia/Manila
			cutoffMinutes: 15,
			timeZone:      "Asia/Manila",
			isActive:      true,
		},
		{
			drawType:      "EVENING"   as const,
			scheduledTime: "21:00",   // 9:00 PM Asia/Manila
			cutoffMinutes: 15,
			timeZone:      "Asia/Manila",
			isActive:      true,
		},
	];

	for (const config of scheduleConfigs) {
		const existing = await prisma.drawSchedule.findFirst({
			where: { drawType: config.drawType },
		});

		if (existing) {
			console.log(`⏭️  DrawSchedule ${config.drawType} already exists, skipping.`);
		} else {
			await prisma.drawSchedule.create({ data: config });
			const label =
				config.drawType === "MORNING"
					? "11:00 AM"
					: config.drawType === "AFTERNOON"
					? "4:00 PM"
					: "9:00 PM";
			console.log(
				`✅ DrawSchedule ${config.drawType} created — ${label}, cutoff ${config.cutoffMinutes} min.`
			);
		}
	}

	console.log("\n📊 Configuration Summary:");
	const cfg = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
	const schedules = await prisma.drawSchedule.findMany({
		orderBy: { scheduledTime: "asc" },
	});

	if (cfg) {
		console.log(`   Game  : maxNumber=${cfg.maxNumber}, payout=${cfg.payoutMultiplier}×`);
		console.log(`   Bets  : ₱${cfg.minBet} – ₱${cfg.maxBet}`);
		console.log(
			`   Rates : cobrador=${cfg.cobradorRate * 100}% | cabo=${cfg.caboRate * 100}% | capitalista=${cfg.capitalistaRate * 100}% | gov=${cfg.governmentRate * 100}%`
		);
	}

	for (const s of schedules) {
		const status = s.isActive ? "ACTIVE" : "INACTIVE";
		console.log(
			`   Draw  : ${s.drawType.padEnd(9)} ${s.scheduledTime}  cutoff=${s.cutoffMinutes}min  [${status}]`
		);
	}

	console.log("\n🎉 Admin configuration seeding complete!");
}

// ── Standalone runner ──────────────────────────────────────────────────────────
// Run directly:  npx ts-node prisma/seeds/configSeeder.ts

if (require.main === module) {
	seedConfig()
		.then(() => prisma.$disconnect())
		.catch(async (e) => {
			console.error("❌ Config seed failed:", e);
			await prisma.$disconnect();
			process.exit(1);
		});
}
