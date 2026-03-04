import { expect } from "chai";
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "../../../generated/prisma";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test"), override: true });

const prisma = new PrismaClient();
const keepQaData = process.env.QA_KEEP_DATA === "true";

describe("QA Integration - Test Database Persistence", () => {
	after(async () => {
		await prisma.$disconnect();
	});

	it("writes and reads a user record from the dedicated QA database", async function () {
		this.timeout(20000);

		const dbUrl = process.env.DATABASE_URL || "";
		expect(dbUrl).to.contain("betting-db-test");

		const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const email = `qa.integration+${runId}@example.com`;
		const phoneNumber = `09${Math.floor(100000000 + Math.random() * 900000000)}`;

		let personId: string | null = null;
		let userId: string | null = null;

		try {
			const person = await prisma.person.create({
				data: {
					personalInfo: {
						firstName: "QA",
						lastName: "Integration",
						dateOfBirth: new Date("1990-01-01"),
					},
					contactInfo: {
						email,
						phones: [{ type: "mobile", number: phoneNumber, isPrimary: true }],
						address: [],
					},
				},
			});
			personId = person.id;

			const user = await prisma.user.create({
				data: {
					personId: person.id,
					email,
					phoneNumber,
					password: "hashed-password-placeholder",
					role: "PLAYER",
					loginMethod: "email",
					isEmailVerified: true,
				},
			});
			userId = user.id;

			await prisma.wallet.create({
				data: {
					userId: user.id,
					balance: 0,
					bonus: 0,
					currency: "PHP",
				},
			});

			const savedUser = await prisma.user.findUnique({
				where: { email },
				include: { wallet: true },
			});

			expect(savedUser).to.not.equal(null);
			expect(savedUser?.phoneNumber).to.equal(phoneNumber);
			expect(savedUser?.wallet).to.not.equal(null);
		} finally {
			if (!keepQaData) {
				if (userId) {
					await prisma.session.deleteMany({ where: { userId } });
					await prisma.oTP.deleteMany({ where: { userId } });
					await prisma.wallet.deleteMany({ where: { userId } });
					await prisma.agent.deleteMany({ where: { userId } });
					await prisma.user.deleteMany({ where: { id: userId } });
				}
				if (personId) {
					await prisma.person.deleteMany({ where: { id: personId } });
				}
			}
		}
	});
});
