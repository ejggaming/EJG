import { PrismaClient } from "../../generated/prisma";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

export async function seedAdminUser() {
	console.log("🌱 Seeding admin user...");

	const adminEmail = "admin@jueteng.ph";
	const adminPassword = "Admin@123456";

	// Check if admin already exists
	const existing = await prisma.user.findFirst({
		where: { email: adminEmail },
	});

	if (existing) {
		console.log("⏭️  Admin user already exists, skipping.");
		return;
	}

	const hashedPassword = await argon2.hash(adminPassword);

	// Create Person
	const person = await prisma.person.create({
		data: {
			personalInfo: {
				firstName: "System",
				lastName: "Admin",
				middleName: "",
			},
			contactInfo: {
				email: adminEmail,
				phones: [{ type: "mobile", number: "09170000001", isPrimary: true }],
				address: [],
			},
		},
	});

	// Create User with ADMIN role
	const user = await prisma.user.create({
		data: {
			personId: person.id,
			email: adminEmail,
			userName: "admin",
			phoneNumber: "09170000001",
			password: hashedPassword,
			role: "ADMIN",
			status: "active",
			isEmailVerified: true,
			loginMethod: "email",
		},
	});

	// Create Wallet
	await prisma.wallet.create({
		data: {
			userId: user.id,
			balance: 0,
			bonus: 0,
			currency: "PHP",
		},
	});

	console.log("✅ Admin user seeded successfully!");
	console.log(`   Email:    ${adminEmail}`);
	console.log(`   Password: ${adminPassword}`);
	console.log(`   Role:     ADMIN`);
}

// Allow running standalone: npx ts-node prisma/seeds/adminSeeder.ts
if (require.main === module) {
	seedAdminUser()
		.then(() => prisma.$disconnect())
		.catch(async (e) => {
			console.error("❌ Admin seed failed:", e);
			await prisma.$disconnect();
			process.exit(1);
		});
}
