import { PrismaClient, DrawType } from "../../generated/prisma";
import * as argon2 from "argon2";

export const QA_ADMIN_CREDENTIALS = {
	email: "qa.admin.e2e@example.com",
	userName: "qa_admin_e2e",
	phoneNumber: "09179990001",
	password: "QaAdmin123!",
	firstName: "QA",
	lastName: "Admin",
	role: "ADMIN" as const,
};

export const QA_PLAYER_CREDENTIALS = {
	email: "qa.player.e2e@example.com",
	userName: "qa_player_e2e",
	phoneNumber: "09179990002",
	password: "QaPlayer123!",
	firstName: "QA",
	lastName: "Player",
	role: "PLAYER" as const,
};

export const QA_FLOW_DEFAULTS = {
	depositAmount: 500,
	betAmount: 100,
	betNumbers: [7, 13] as [number, number],
	drawType: "MORNING" as DrawType,
};

type SeedUserInput = {
	email: string;
	userName: string;
	phoneNumber: string;
	password: string;
	firstName: string;
	lastName: string;
	role: "ADMIN" | "PLAYER";
};

type SeededUser = {
	id: string;
	email: string;
	phoneNumber: string;
	password: string;
	role: "ADMIN" | "PLAYER";
	walletId: string;
};

export type QaFlowSeedResult = {
	admin: SeededUser;
	player: SeededUser;
	openDrawId: string;
};

const todayUtcDateOnly = (): Date => {
	const isoDay = new Date().toISOString().slice(0, 10);
	return new Date(`${isoDay}T00:00:00.000Z`);
};

const nextHours = (hoursFromNow: number): Date => {
	return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
};

async function ensureActiveConfig(prisma: PrismaClient): Promise<void> {
	const activeConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
	if (activeConfig) {
		return;
	}

	await prisma.juetengConfig.create({
		data: {
			maxNumber: 37,
			allowRepeat: false,
			payoutMultiplier: 500,
			minBet: 1,
			maxBet: 1000,
			cobradorRate: 0.15,
			caboRate: 0.05,
			capitalistaRate: 0.25,
			governmentRate: 0,
			currency: "PHP",
			isActive: true,
		},
	});
}

async function ensureSchedule(
	prisma: PrismaClient,
	drawType: DrawType,
	scheduledTime: string,
): Promise<{ id: string }> {
	return prisma.drawSchedule.upsert({
		where: { drawType },
		update: {
			scheduledTime,
			cutoffMinutes: 15,
			timeZone: "Asia/Manila",
			isActive: true,
		},
		create: {
			drawType,
			scheduledTime,
			cutoffMinutes: 15,
			timeZone: "Asia/Manila",
			isActive: true,
		},
		select: { id: true },
	});
}

async function ensureOpenDraw(
	prisma: PrismaClient,
	scheduleId: string,
	drawType: DrawType,
): Promise<{ id: string }> {
	const drawDate = todayUtcDateOnly();

	const existingOpenDraw = await prisma.juetengDraw.findFirst({
		where: {
			drawDate,
			drawType,
			status: "OPEN",
		},
		orderBy: { createdAt: "desc" },
		select: { id: true },
	});

	if (existingOpenDraw) {
		return existingOpenDraw;
	}

	const existingDrawToday = await prisma.juetengDraw.findFirst({
		where: {
			drawDate,
			drawType,
		},
		orderBy: { createdAt: "desc" },
		select: { id: true, scheduledAt: true },
	});

	if (existingDrawToday) {
		return prisma.juetengDraw.update({
			where: { id: existingDrawToday.id },
			data: {
				status: "OPEN",
				openedAt: new Date(),
				scheduledAt:
					existingDrawToday.scheduledAt > new Date()
						? existingDrawToday.scheduledAt
						: nextHours(2),
			},
			select: { id: true },
		});
	}

	return prisma.juetengDraw.create({
		data: {
			scheduleId,
			drawDate,
			drawType,
			status: "OPEN",
			openedAt: new Date(),
			scheduledAt: nextHours(2),
		},
		select: { id: true },
	});
}

async function ensureSeedUser(
	prisma: PrismaClient,
	input: SeedUserInput,
): Promise<SeededUser> {
	const hashedPassword = await argon2.hash(input.password);

	const existingUser = await prisma.user.findFirst({
		where: {
			OR: [{ email: input.email }, { phoneNumber: input.phoneNumber }, { userName: input.userName }],
		},
		include: {
			wallet: true,
			person: true,
		},
	});

	if (existingUser) {
		await prisma.person.update({
			where: { id: existingUser.personId },
			data: {
				personalInfo: {
					firstName: input.firstName,
					lastName: input.lastName,
					dateOfBirth: new Date("1990-01-01"),
					age: 36,
				},
				contactInfo: {
					email: input.email,
					phones: [{ type: "mobile", number: input.phoneNumber, isPrimary: true }],
					address: [],
				},
			},
		});

		const user = await prisma.user.update({
			where: { id: existingUser.id },
			data: {
				email: input.email,
				userName: input.userName,
				phoneNumber: input.phoneNumber,
				password: hashedPassword,
				role: input.role,
				status: "active",
				isDeleted: false,
				isEmailVerified: true,
				loginMethod: "email",
			},
		});

		const wallet = existingUser.wallet
			? await prisma.wallet.update({
					where: { id: existingUser.wallet.id },
					data: { status: "ACTIVE", currency: "PHP" },
			  })
			: await prisma.wallet.create({
					data: {
						userId: user.id,
						balance: 0,
						bonus: 0,
						currency: "PHP",
						status: "ACTIVE",
					},
			  });

		return {
			id: user.id,
			email: input.email,
			phoneNumber: input.phoneNumber,
			password: input.password,
			role: input.role,
			walletId: wallet.id,
		};
	}

	const person = await prisma.person.create({
		data: {
			personalInfo: {
				firstName: input.firstName,
				lastName: input.lastName,
				dateOfBirth: new Date("1990-01-01"),
				age: 36,
			},
			contactInfo: {
				email: input.email,
				phones: [{ type: "mobile", number: input.phoneNumber, isPrimary: true }],
				address: [],
			},
		},
	});

	const user = await prisma.user.create({
		data: {
			personId: person.id,
			email: input.email,
			userName: input.userName,
			phoneNumber: input.phoneNumber,
			password: hashedPassword,
			role: input.role,
			status: "active",
			isEmailVerified: true,
			loginMethod: "email",
		},
	});

	const wallet = await prisma.wallet.create({
		data: {
			userId: user.id,
			balance: 0,
			bonus: 0,
			currency: "PHP",
			status: "ACTIVE",
		},
	});

	return {
		id: user.id,
		email: input.email,
		phoneNumber: input.phoneNumber,
		password: input.password,
		role: input.role,
		walletId: wallet.id,
	};
}

export async function seedQaFlowData(prismaInput?: PrismaClient): Promise<QaFlowSeedResult> {
	const prisma = prismaInput ?? new PrismaClient();
	const shouldDisconnect = !prismaInput;

	try {
		await ensureActiveConfig(prisma);

		const morning = await ensureSchedule(prisma, "MORNING", "11:00");
		await ensureSchedule(prisma, "AFTERNOON", "16:00");
		await ensureSchedule(prisma, "EVENING", "21:00");

		const admin = await ensureSeedUser(prisma, QA_ADMIN_CREDENTIALS);
		const player = await ensureSeedUser(prisma, QA_PLAYER_CREDENTIALS);

		const openDraw = await ensureOpenDraw(prisma, morning.id, QA_FLOW_DEFAULTS.drawType);

		return {
			admin,
			player,
			openDrawId: openDraw.id,
		};
	} finally {
		if (shouldDisconnect) {
			await prisma.$disconnect();
		}
	}
}

if (require.main === module) {
	seedQaFlowData()
		.then((result) => {
			console.log("QA flow seed complete");
			console.log(`Admin: ${result.admin.email} / ${result.admin.phoneNumber}`);
			console.log(`Player: ${result.player.email} / ${result.player.phoneNumber}`);
			console.log(`Open draw: ${result.openDrawId}`);
		})
		.catch((error) => {
			console.error("QA flow seed failed:", error);
			process.exit(1);
		});
}
