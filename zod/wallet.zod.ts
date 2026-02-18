import { z } from "zod";

// Create Wallet Schema
export const CreateWalletSchema = z.object({
	userId: z.string().min(1),
	balance: z.number().optional(),
	bonus: z.number().optional(),
	currency: z.string().optional(),
	status: z.enum(["ACTIVE", "FROZEN", "CLOSED"]).optional(),
});

export type CreateWallet = z.infer<typeof CreateWalletSchema>;

// Update Wallet Schema
export const UpdateWalletSchema = CreateWalletSchema.partial();

export type UpdateWallet = z.infer<typeof UpdateWalletSchema>;
