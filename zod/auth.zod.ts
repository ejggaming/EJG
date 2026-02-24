import { z } from "zod";

// ── Register ──
export const RegisterSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(128, "Password must not exceed 128 characters")
		.regex(
			/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",.\/<>?])/,
			"Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character",
		),
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	middleName: z.string().optional(),
	phoneNumber: z
		.string()
		.regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number format (E.164)")
		.optional(),
	userName: z.string().min(3, "Username must be at least 3 characters").optional(),
	role: z.enum(["PLAYER", "AGENT"]).default("PLAYER"),
	dateOfBirth: z.coerce
		.date({ required_error: "Date of birth is required" })
		.refine(
			(dob) => {
				const today = new Date();
				const age = today.getFullYear() - dob.getFullYear();
				const m = today.getMonth() - dob.getMonth();
				const actualAge =
					m < 0 || (m === 0 && today.getDate() < dob.getDate()) ? age - 1 : age;
				return actualAge >= 18;
			},
			{ message: "You must be at least 18 years old to register" },
		),
});

// ── Login ──
export const LoginSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

// ── Refresh Token ──
export const RefreshTokenSchema = z.object({
	refreshToken: z.string().optional(), // Can also come from cookie
});

// ── Password Reset Request ──
export const PasswordResetRequestSchema = z.object({
	email: z.string().email("Invalid email address"),
});

// ── Password Reset ──
export const PasswordResetSchema = z.object({
	token: z.string().min(1, "Reset token is required"),
	newPassword: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(128, "Password must not exceed 128 characters"),
});

// ── Change Password ──
export const ChangePasswordSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required"),
	newPassword: z
		.string()
		.min(8, "New password must be at least 8 characters")
		.max(128, "Password must not exceed 128 characters")
		.regex(
			/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",.\/<>?])/,
			"Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character",
		),
});

// ── Verify OTP ──
export const VerifyOtpSchema = z
	.object({
		email: z.string().email().optional(),
		phone: z
			.string()
			.regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number format")
			.optional(),
		code: z.string().min(4, "OTP code is required"),
		type: z.enum([
			"REGISTRATION",
			"LOGIN",
			"PASSWORD_RESET",
			"PHONE_VERIFICATION",
			"EMAIL_VERIFICATION",
			"WITHDRAWAL",
		]),
	})
	.refine((data) => data.email || data.phone, {
		message: "Either email or phone is required",
		path: ["email"],
	});

// ── Request OTP ──
export const RequestOtpSchema = z
	.object({
		email: z.string().email().optional(),
		phone: z
			.string()
			.regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number format")
			.optional(),
		type: z
			.enum([
				"REGISTRATION",
				"LOGIN",
				"PASSWORD_RESET",
				"PHONE_VERIFICATION",
				"EMAIL_VERIFICATION",
				"WITHDRAWAL",
			])
			.default("EMAIL_VERIFICATION"),
	})
	.refine((data) => data.email || data.phone, {
		message: "Either email or phone is required",
		path: ["email"],
	});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;
