import { PrismaClient } from "../generated/prisma";
import * as argon2 from "argon2";
import { seedTemplates } from "./seeds/templateSeeder";
import { seedBettingData } from "./seeds/bettingSeeder";
import { seedJuetengData } from "./seeds/juetengSeeder";
const prisma = new PrismaClient();

async function main() {
	await seedTemplates();
	await seedBettingData();
	await seedJuetengData();

	console.log("Seeding completed successfully!");
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("Error during seeding:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
