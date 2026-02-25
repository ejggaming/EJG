import { z } from "zod";

export const CreateAutoBetSchema = z.object({
	number1: z.number().int().min(1).max(37),
	number2: z.number().int().min(1).max(37),
	amountPerBet: z.number().positive(),
	durationDays: z.number().int().min(1).max(30),
	startDate: z.string().datetime().optional(),
});

export type CreateAutoBet = z.infer<typeof CreateAutoBetSchema>;
