import { z } from "zod";

// Create DrawSchedule Schema
export const CreateDrawScheduleSchema = z.object({
	drawType: z.enum(["MORNING", "AFTERNOON"]),
	scheduledTime: z.string().min(1),
	cutoffMinutes: z.number().int().min(0).optional(),
	timeZone: z.string().optional(),
	isActive: z.boolean().optional(),
});

export type CreateDrawSchedule = z.infer<typeof CreateDrawScheduleSchema>;

// Update DrawSchedule Schema
export const UpdateDrawScheduleSchema = CreateDrawScheduleSchema.partial();

export type UpdateDrawSchedule = z.infer<typeof UpdateDrawScheduleSchema>;
