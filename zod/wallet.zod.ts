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

// Deposit Request Schema
export const DepositRequestSchema = z.object({
	amount: z.number().min(50, "Minimum deposit is ₱50").max(50000, "Maximum deposit is ₱50,000"),
	paymentMethod: z.string().min(1, "Payment method is required"),
	referenceNumber: z.string().optional(),
});

export type DepositRequest = z.infer<typeof DepositRequestSchema>;

// Withdraw Request Schema
export const WithdrawRequestSchema = z.object({
	amount: z.number().min(100, "Minimum withdrawal is ₱100"),
	paymentMethod: z.string().min(1, "Withdrawal method is required"),
	accountNumber: z.string().min(1, "Account number is required"),
	accountName: z.string().min(1, "Account name is required"),
});

export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
