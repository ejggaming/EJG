#!/usr/bin/env ts-node

import { DrawStatus, PrismaClient } from "../generated/prisma";

const NON_DRAWN_STATUSES: DrawStatus[] = ["SCHEDULED", "OPEN", "CLOSED", "CANCELLED"];

type CliArgs = {
	drawId: string;
	status: DrawStatus;
	force: boolean;
	dryRun: boolean;
};

function printUsage() {
	console.log("Reset a draw so result encoding can be tested again.");
	console.log("");
	console.log("Usage:");
	console.log("  npm run reset-draw-result -- <drawId> [-- --status CLOSED] [-- --force] [-- --dry-run]");
	console.log("  npx ts-node scripts/reset-draw-result.ts <drawId> [--status CLOSED] [--force] [--dry-run]");
	console.log("");
	console.log("Examples:");
	console.log("  npm run reset-draw-result -- 67a5a38e6fa2d4a12f932111");
	console.log("  npm run reset-draw-result -- 67a5a38e6fa2d4a12f932111 -- --status OPEN");
	console.log("  npm run reset-draw-result -- 67a5a38e6fa2d4a12f932111 -- --dry-run");
	console.log("  npx ts-node scripts/reset-draw-result.ts 67a5a38e6fa2d4a12f932111 --dry-run");
}

function parseStatus(value: string): DrawStatus | null {
	const normalized = value.trim().toUpperCase();
	if (
		normalized === "SCHEDULED" ||
		normalized === "OPEN" ||
		normalized === "CLOSED" ||
		normalized === "DRAWN" ||
		normalized === "SETTLED" ||
		normalized === "CANCELLED"
	) {
		return normalized as DrawStatus;
	}
	return null;
}

function parseArgs(argv: string[]): CliArgs {
	if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	let drawId = "";
	let status: DrawStatus = "CLOSED";
	let force = false;
	let dryRun = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--status" || arg === "-s") {
			const value = argv[i + 1];
			if (!value) {
				throw new Error("Missing value for --status");
			}
			const parsed = parseStatus(value);
			if (!parsed) {
				throw new Error(
					`Invalid status "${value}". Valid values: SCHEDULED, OPEN, CLOSED, DRAWN, SETTLED, CANCELLED`,
				);
			}
			status = parsed;
			i++;
			continue;
		}
		if (arg === "--force" || arg === "-f") {
			force = true;
			continue;
		}
		if (arg === "--dry-run" || arg === "-d") {
			dryRun = true;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		if (!drawId) {
			drawId = arg;
			continue;
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}

	if (!drawId) {
		throw new Error("Missing required drawId");
	}
	if (!/^[0-9a-fA-F]{24}$/.test(drawId)) {
		throw new Error(
			`Invalid drawId "${drawId}". Expected a 24-character Mongo ObjectId.`,
		);
	}

	return { drawId, status, force, dryRun };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.status === "DRAWN" || args.status === "SETTLED") {
		throw new Error('Target status must not be "DRAWN" or "SETTLED". Use a non-drawn status.');
	}

	const prisma = new PrismaClient();

	try {
		const draw = await prisma.juetengDraw.findFirst({
			where: { id: args.drawId },
			select: {
				id: true,
				status: true,
				number1: true,
				number2: true,
				combinationKey: true,
				drawnAt: true,
				settledAt: true,
			},
		});

		if (!draw) {
			throw new Error(`Draw not found: ${args.drawId}`);
		}

		if (draw.status === "SETTLED" && !args.force) {
			throw new Error(
				'Draw is already SETTLED. Reverting it can leave related bets/payouts inconsistent. Use --force if this is intentional.',
			);
		}

		console.log("Current draw state:");
		console.log(
			JSON.stringify(
				{
					id: draw.id,
					status: draw.status,
					number1: draw.number1,
					number2: draw.number2,
					combinationKey: draw.combinationKey,
					drawnAt: draw.drawnAt,
					settledAt: draw.settledAt,
				},
				null,
				2,
			),
		);

		const updateData = {
			status: args.status,
			number1: null,
			number2: null,
			combinationKey: null,
			drawnAt: null,
			settledAt: null,
		};

		console.log("\nPlanned update:");
		console.log(JSON.stringify(updateData, null, 2));

		if (args.dryRun) {
			console.log("\nDry-run only. No database changes applied.");
			return;
		}

		const updated = await prisma.juetengDraw.update({
			where: { id: args.drawId },
			data: updateData,
			select: {
				id: true,
				status: true,
				number1: true,
				number2: true,
				combinationKey: true,
				drawnAt: true,
				settledAt: true,
			},
		});

		console.log("\nUpdated draw state:");
		console.log(JSON.stringify(updated, null, 2));

		if (!NON_DRAWN_STATUSES.includes(updated.status)) {
			console.log(
				"\nWarning: status is still in a drawn/settled flow. Use a non-drawn status before recording a new result.",
			);
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(String(error));
	process.exit(1);
});
