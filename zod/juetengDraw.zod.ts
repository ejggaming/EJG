import { z } from "zod";

// Schema for POST /:id/result — bolador records the two drawn balls
export const RecordResultSchema = z.object({
	number1: z.number().int().min(1),
	number2: z.number().int().min(1),
	boladorId: z.string().optional(),
});

export type RecordResult = z.infer<typeof RecordResultSchema>;

// Create JuetengDraw Schema
export const CreateJuetengDrawSchema = z.object({
	scheduleId: z.string().min(1),
	drawDate: z.coerce.date(),
	drawType: z.enum(["MORNING", "AFTERNOON", "EVENING"]),
	status: z.enum(["SCHEDULED", "OPEN", "CLOSED", "DRAWN", "SETTLED", "CANCELLED"]).optional(),
	scheduledAt: z.coerce.date(),
	openedAt: z.coerce.date().optional(),
	closedAt: z.coerce.date().optional(),
	drawnAt: z.coerce.date().optional(),
	settledAt: z.coerce.date().optional(),
	number1: z.number().int().optional(),
	number2: z.number().int().optional(),
	combinationKey: z.string().optional(),
	boladorId: z.string().optional(),
	totalBets: z.number().int().optional(),
	totalStake: z.number().optional(),
	totalPayout: z.number().optional(),
	grossProfit: z.number().optional(),
});

export type CreateJuetengDraw = z.infer<typeof CreateJuetengDrawSchema>;

// Update JuetengDraw Schema
export const UpdateJuetengDrawSchema = CreateJuetengDrawSchema.partial();

export type UpdateJuetengDraw = z.infer<typeof UpdateJuetengDrawSchema>;
