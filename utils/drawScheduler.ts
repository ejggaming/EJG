import cron from "node-cron";
import { PrismaClient } from "../generated/prisma";
import { Server } from "socket.io";
import { getLogger } from "../helper/logger";

const logger = getLogger().child({ module: "drawScheduler" });

/**
 * Start the draw scheduler.
 * Runs every minute and auto-closes any OPEN draw whose cutoff time has passed.
 * cutoffMinutes is read from the draw's DrawSchedule — so changing it in the DB
 * takes effect on the next cron tick without a server restart.
 */
export function startDrawScheduler(prisma: PrismaClient, io: Server): void {
	cron.schedule(
		"* * * * *",
		async () => {
			try {
				await closeDrawsAtCutoff(prisma, io);
			} catch (error) {
				logger.error("[drawScheduler] Unhandled error in cron tick:", error);
			}
		},
		{ timezone: "Asia/Manila" },
	);

	logger.info("[drawScheduler] Started — checks every minute for cutoff closures");
}

async function closeDrawsAtCutoff(prisma: PrismaClient, io: Server): Promise<void> {
	const now = new Date();

	// Fetch all OPEN draws and join their schedule to get cutoffMinutes
	const openDraws = await prisma.juetengDraw.findMany({
		where: { status: "OPEN" },
		include: { schedule: true },
	});

	for (const draw of openDraws) {
		const cutoffMs = draw.schedule.cutoffMinutes * 60 * 1000;
		const cutoffAt = new Date(draw.scheduledAt.getTime() - cutoffMs);

		if (now >= cutoffAt) {
			await prisma.juetengDraw.update({
				where: { id: draw.id },
				data: { status: "CLOSED", closedAt: now },
			});

			// Notify all connected clients so the UI updates immediately
			io.emit("draw:closed", {
				drawId: draw.id,
				drawType: draw.drawType,
				closedAt: now.toISOString(),
			});

			logger.info(
				`[drawScheduler] Auto-closed draw ${draw.id} (${draw.drawType}) — ` +
					`cutoff was ${draw.schedule.cutoffMinutes} min before ${draw.scheduledAt.toISOString()}`,
			);
		}
	}
}
