import { z } from "zod";

// Input schema for placing a bet — server computes combinationKey, reference, status, isWinner
export const CreateJuetengBetSchema = z.object({
	drawId: z.string().min(1),
	bettorId: z.string().min(1).optional(), // defaults to req.userId for self-service
	cobradorId: z.string().min(1).optional(), // optional for direct player bets
	caboId: z.string().optional(),
	number1: z.number().int().min(1),
	number2: z.number().int().min(1),
	amount: z.number().positive(),
	currency: z.string().optional(),
});

export type CreateJuetengBet = z.infer<typeof CreateJuetengBetSchema>;

// Update schema — only these fields can be patched directly
export const UpdateJuetengBetSchema = z.object({
	caboId: z.string().optional(),
	amount: z.number().positive().optional(),
	currency: z.string().optional(),
	status: z.enum(["PENDING", "WON", "LOST", "VOID", "REFUNDED"]).optional(),
});

export type UpdateJuetengBet = z.infer<typeof UpdateJuetengBetSchema>;
