import { z } from "zod";

// Create KYC Schema
export const CreateKycSchema = z.object({
	userId: z.string().min(1),
	status: z.enum(["PENDING", "APPROVED", "REJECTED", "REQUIRES_MORE_INFO"]).optional(),
	documentType: z.string().min(1),
	documentUrl: z.string().min(1).optional(), // populated from Cloudinary after file upload
	selfieUrl: z.string().optional(),
	reviewedBy: z.string().optional(),
	notes: z.string().optional(),
});

export type CreateKyc = z.infer<typeof CreateKycSchema>;

// Update KYC Schema
export const UpdateKycSchema = CreateKycSchema.partial();

export type UpdateKyc = z.infer<typeof UpdateKycSchema>;
