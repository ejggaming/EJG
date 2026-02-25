import { PrismaClient } from "../generated/prisma";
import { seedTemplates } from "./seeds/templateSeeder";
import { seedAdminUser } from "./seeds/adminSeeder";
import { seedConfig } from "./seeds/configSeeder";
import { seedJuetengData } from "./seeds/juetengSeeder";

const prisma = new PrismaClient();

async function main() {
	console.log("🚀 Starting database seeding...\n");

	// 1. Admin user (system access)
	await seedAdminUser();

	// 2. Game configuration + draw schedules (Morning, Afternoon, Evening)
	await seedConfig();

	// 3. Templates (email/SMS)
	await seedTemplates();

	// 4. Sample draws + territory (dev/testing — configSeeder called internally, idempotent)
	await seedJuetengData();

	console.log("\n✅ All seeding completed successfully!");
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("❌ Error during seeding:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
