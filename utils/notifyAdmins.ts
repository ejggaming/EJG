import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const notifyLogger = logger.child({ module: "admin-notify" });

interface AdminNotification {
	type: "TRANSACTION" | "KYC_UPDATE" | "SYSTEM" | "SECURITY" | "PAYOUT" | "COMMISSION";
	title: string;
	body: string;
	metadata?: Record<string, unknown>;
}

/**
 * Create a notification record for every ADMIN / SUPER_ADMIN user and
 * emit a real-time socket event so online admins see it instantly.
 */
export async function notifyAdmins(
	prisma: PrismaClient,
	io: any,
	notification: AdminNotification,
) {
	try {
		const admins = await prisma.user.findMany({
			where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
			select: { id: true },
		});

		if (admins.length === 0) return;

		// Bulk-create a notification for each admin
		const records = await Promise.all(
			admins.map((admin) =>
				prisma.notification.create({
					data: {
						userId: admin.id,
						type: notification.type,
						title: notification.title,
						body: notification.body,
						channel: "IN_APP",
						status: "SENT",
						sentAt: new Date(),
						metadata: (notification.metadata as any) ?? undefined,
					},
				}),
			),
		);

		// Emit to the "admin" socket room so all connected admins get the event
		if (io) {
			io.to("admin").emit("admin:notification", {
				title: notification.title,
				body: notification.body,
				type: notification.type,
				metadata: notification.metadata,
				createdAt: new Date().toISOString(),
			});
		}

		notifyLogger.info(
			`Admin notification sent to ${records.length} admin(s): ${notification.title}`,
		);
	} catch (error) {
		// Never let notification failures break the main flow
		notifyLogger.error(`Failed to notify admins: ${error}`);
	}
}
