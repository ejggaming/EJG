import { z } from "zod";

// ── Create Notification ──
export const CreateNotificationSchema = z.object({
	userId: z.string().min(1, "User ID is required"),
	type: z.enum([
		"SYSTEM",
		"TRANSACTION",
		"KYC_UPDATE",
		"DRAW_RESULT",
		"PAYOUT",
		"SECURITY",
		"COMMISSION",
	]),
	title: z.string().min(1, "Title is required"),
	body: z.string().min(1, "Body is required"),
	channel: z.enum(["IN_APP", "SMS", "EMAIL", "PUSH"]).default("IN_APP"),
	metadata: z.any().optional(),
});

// ── Update Notification ──
export const UpdateNotificationSchema = z.object({
	status: z.enum(["PENDING", "SENT", "READ", "FAILED"]).optional(),
	readAt: z.coerce.date().optional(),
	sentAt: z.coerce.date().optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;
