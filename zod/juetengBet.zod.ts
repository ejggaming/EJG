import { z } from "zod";

// Create JuetengBet Schema
export const CreateJuetengBetSchema = z.object({
	drawId: z.string().min(1),
	bettorId: z.string().min(1),
	cobradorId: z.string().min(1),
	caboId: z.string().optional(),
	number1: z.number().int().min(1),
	number2: z.number().int().min(1),
	combinationKey: z.string().min(1),
	amount: z.number().positive(),
	currency: z.string().optional(),
	status: z.enum(["PENDING", "WON", "LOST", "VOID", "REFUNDED"]).optional(),
	isWinner: z.boolean().optional(),
	payoutAmount: z.number().optional(),
	reference: z.string().min(1),
});

export type CreateJuetengBet = z.infer<typeof CreateJuetengBetSchema>;

// Update JuetengBet Schema
export const UpdateJuetengBetSchema = CreateJuetengBetSchema.partial();

export type UpdateJuetengBet = z.infer<typeof UpdateJuetengBetSchema>;
