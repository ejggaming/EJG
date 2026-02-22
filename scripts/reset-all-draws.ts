#!/usr/bin/env ts-node
/**
 * reset-all-draws.ts
 *
 * Resets every JuetengDraw in the database back to OPEN status
 * and clears all result fields (number1, number2, combinationKey,
 * drawnAt, closedAt, settledAt, boladorId).
 *
 * Usage:
 *   npm run reset-all-draws
 *   npm run reset-all-draws -- --dry-run
 *   npm run reset-all-draws -- --force          (required when SETTLED draws exist)
 *   npx ts-node scripts/reset-all-draws.ts [--dry-run] [--force]
 */

import { PrismaClient } from "../generated/prisma";

type CliArgs = {
	dryRun: boolean;
	force: boolean;
};

function printUsage() {
	console.log("Reset ALL jueteng draws to OPEN status and clear their results.");
	console.log("");
	console.log("Usage:");
	console.log("  npm run reset-all-draws");
	console.log("  npm run reset-all-draws -- --dry-run");
	console.log("  npm run reset-all-draws -- --force");
	console.log("  npx ts-node scripts/reset-all-draws.ts [--dry-run] [--force]");
	console.log("");
	console.log("Options:");
	console.log("  --dry-run, -d   Preview changes without writing to the database");
	console.log("  --force,   -f   Required when SETTLED draws are present");
	console.log("  --help,    -h   Show this help message");
}

function parseArgs(argv: string[]): CliArgs {
	if (argv.includes("--help") || argv.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	let dryRun = false;
	let force = false;

	for (const arg of argv) {
		if (arg === "--dry-run" || arg === "-d") {
			dryRun = true;
		} else if (arg === "--force" || arg === "-f") {
			force = true;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return { dryRun, force };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	const prisma = new PrismaClient();

	try {
		// Fetch all draws with their current state
		const draws = await prisma.juetengDraw.findMany({
			select: {
				id: true,
				status: true,
				number1: true,
				number2: true,
				combinationKey: true,
				drawnAt: true,
				closedAt: true,
				settledAt: true,
				boladorId: true,
			},
			orderBy: [{ drawDate: "asc" }, { drawType: "asc" }],
		});

		if (draws.length === 0) {
			console.log("No draws found. Nothing to reset.");
			return;
		}

		// Warn and guard against SETTLED draws unless --force is passed
		const settledDraws = draws.filter((d) => d.status === "SETTLED");
		if (settledDraws.length > 0 && !args.force) {
			console.error(
				`\nError: ${settledDraws.length} draw(s) are SETTLED. Reverting them can leave` +
					" related bets, payouts, and commissions in an inconsistent state.\n" +
					"Pass --force if this is intentional.",
			);
			process.exit(1);
		}

		console.log(`Found ${draws.length} draw(s) to reset:\n`);
		console.log(
			draws
				.map(
					(d) =>
						`  ${d.id}  status=${d.status}` +
						(d.number1 !== null ? `  result=${d.number1}-${d.number2}` : "  result=—"),
				)
				.join("\n"),
		);

		const updateData = {
			status: "OPEN" as const,
			number1: null,
			number2: null,
			combinationKey: null,
			drawnAt: null,
			closedAt: null,
			settledAt: null,
			boladorId: null,
		};

		console.log("\nPlanned update for every draw:");
		console.log(JSON.stringify(updateData, null, 2));

		if (args.dryRun) {
			console.log("\nDry-run only. No database changes applied.");
			return;
		}

		// Apply the reset to all draws in one bulk updateMany call
		const result = await prisma.juetengDraw.updateMany({
			data: updateData,
		});

		console.log(`\nDone. ${result.count} draw(s) reset to OPEN with results cleared.`);

		if (settledDraws.length > 0) {
			console.warn(
				"\nWarning: SETTLED draws were forcibly reverted. Their associated bets," +
					" payouts, and commissions still exist in the database and are now orphaned." +
					" Review and clean them up manually if needed.",
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
