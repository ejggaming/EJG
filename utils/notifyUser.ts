import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const notifyLogger = logger.child({ module: "user-notify" });

interface UserNotification {
	type:
		| "TRANSACTION"
		| "KYC_UPDATE"
		| "SYSTEM"
		| "SECURITY"
		| "PAYOUT"
		| "COMMISSION"
		| "DRAW_RESULT";
	title: string;
	body: string;
	metadata?: Record<string, unknown>;
}

/**
 * Create a notification record for a specific user and
 * emit a real-time socket event so they see it instantly if online.
 */
export async function notifyUser(
	prisma: PrismaClient,
	io: any,
	userId: string,
	notification: UserNotification,
) {
	try {
		const record = await prisma.notification.create({
			data: {
				userId,
				type: notification.type,
				title: notification.title,
				body: notification.body,
				channel: "IN_APP",
				status: "SENT",
				sentAt: new Date(),
				metadata: (notification.metadata as any) ?? undefined,
			},
		});

		// Emit to the user's personal socket room
		if (io) {
			io.to(userId).emit("notification", {
				id: record.id,
				title: notification.title,
				body: notification.body,
				type: notification.type,
				metadata: notification.metadata,
				createdAt: record.createdAt.toISOString(),
			});
		}

		notifyLogger.info(`Notification sent to user ${userId}: ${notification.title}`);
	} catch (error) {
		// Never let notification failures break the main flow
		notifyLogger.error(`Failed to notify user ${userId}: ${error}`);
	}
}
