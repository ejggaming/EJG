import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import crypto from "crypto";
import { getLogger } from "../../helper/logger";
import { buildSuccessResponse } from "../../helper/success-handler";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	RegisterSchema,
	LoginSchema,
	ChangePasswordSchema,
	VerifyOtpSchema,
	RequestOtpSchema,
} from "../../zod/auth.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/config";
import { config as constants } from "../../config/constant";
import { sendOtpEmail, sendWelcomeEmail } from "../../utils/emailService";
import { notifyUser } from "../../utils/notifyUser";

const logger = getLogger();
const authLogger = logger.child({ module: "auth" });

const generateOtpCode = (length: number = 6): string => {
	let otp = "";
	for (let i = 0; i < length; i++) {
		otp += crypto.randomInt(0, 10).toString();
	}
	return otp;
};

export const controller = (prisma: PrismaClient) => {
	// ── REGISTER ──
	const register = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = RegisterSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			authLogger.error(`Registration validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse(
				constants.ERROR.AUTH.REGISTRATION_VALIDATION_FAILED,
				400,
				formattedErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		const {
			email,
			password,
			firstName,
			lastName,
			middleName,
			phoneNumber,
			userName,
			role,
			dateOfBirth,
		} = validation.data;

		try {
			// Check if user already exists
			const existingUser = await prisma.user.findFirst({
				where: {
					OR: [
						{ email },
						...(userName ? [{ userName }] : []),
						...(phoneNumber ? [{ phoneNumber }] : []),
					],
				},
			});

			if (existingUser) {
				authLogger.warn(`Registration attempt with existing email/username: ${email}`);
				const errorResponse = buildErrorResponse(
					constants.ERROR.AUTH.USER_ALREADY_EXISTS,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			// Hash password
			const hashedPassword = await argon2.hash(password);

			// Create Person
			const person = await prisma.person.create({
				data: {
					personalInfo: {
						firstName,
						lastName,
						middleName: middleName || undefined,
						dateOfBirth,
						age: (() => {
							const t = new Date();
							const a = t.getFullYear() - dateOfBirth.getFullYear();
							const m = t.getMonth() - dateOfBirth.getMonth();
							return m < 0 || (m === 0 && t.getDate() < dateOfBirth.getDate())
								? a - 1
								: a;
						})(),
					},
					contactInfo: {
						email,
						phones: phoneNumber
							? [{ type: "mobile", number: phoneNumber, isPrimary: true }]
							: [],
						address: [],
					},
				},
			});

			// Create User
			const user = await prisma.user.create({
				data: {
					personId: person.id,
					email,
					userName: userName || undefined,
					phoneNumber: phoneNumber || undefined,
					password: hashedPassword,
					role: role as any,
					loginMethod: "email",
				},
			});

			// Create Wallet
			await prisma.wallet.create({
				data: {
					userId: user.id,
					balance: 0,
					bonus: 0,
					currency: "PHP",
				},
			});

			// If user registered as AGENT, create linked agent profile
			if (user.role === "AGENT") {
				await prisma.agent.create({
					data: {
						userId: user.id,
						role: "COBRADOR",
					},
				});
			}

			// Generate JWT tokens
			const accessToken = jwt.sign(
				{
					userId: user.id,
					role: user.role,
					email: user.email,
				},
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.accessTokenExpiry } as jwt.SignOptions,
			);

			const refreshToken = jwt.sign(
				{ userId: user.id },
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.refreshTokenExpiry } as jwt.SignOptions,
			);

			// Create session
			await prisma.session.create({
				data: {
					userId: user.id,
					token: refreshToken,
					ipAddress: req.ip || req.socket.remoteAddress || "unknown",
					userAgent: req.get("User-Agent") || "unknown",
					expiresAt: new Date(Date.now() + config.jwt.refreshCookieMaxAge),
				},
			});

			// Set cookies
			res.cookie("token", accessToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.cookieMaxAge,
			});

			res.cookie("refreshToken", refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.refreshCookieMaxAge,
				path: "/api/auth/refresh",
			});

			logActivity(req, {
				userId: user.id,
				action: constants.ACTIVITY_LOG.TEMPLATE.ACTIONS.USER_REGISTRATION,
				description: `${constants.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.USER_REGISTERED}: ${user.email}`,
				page: {
					url: req.originalUrl,
					title: constants.ACTIVITY_LOG.TEMPLATE.PAGES.USER_REGISTRATION,
				},
			});

			logAudit(req, {
				userId: user.id,
				action: constants.AUDIT_LOG.ACTIONS.REGISTER,
				resource: constants.AUDIT_LOG.RESOURCES.AUTH,
				severity: constants.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: constants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: user.id,
				changesBefore: null,
				changesAfter: { email: user.email, role: user.role },
				description: `User registered: ${user.email}`,
			});

			// ── Send welcome email ──
			sendWelcomeEmail(email, firstName).catch((err) =>
				authLogger.error(`Welcome email failed: ${err}`),
			);

			// ── Auto-send email verification OTP ──
			const otpCode = generateOtpCode(config.otp.length);
			const otpExpiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

			await prisma.oTP.create({
				data: {
					userId: user.id,
					email,
					code: otpCode,
					type: "EMAIL_VERIFICATION" as any,
					channel: "EMAIL",
					expiresAt: otpExpiresAt,
				},
			});

			sendOtpEmail(email, otpCode, "EMAIL_VERIFICATION", config.otp.expiryMinutes).catch(
				(err) => authLogger.error(`OTP email failed after registration: ${err}`),
			);

			const responseData = {
				user: {
					id: user.id,
					email: user.email,
					userName: user.userName,
					role: user.role,
					isEmailVerified: user.isEmailVerified,
					isPhoneVerified: user.isPhoneVerified,
					dateOfBirth: person.personalInfo?.dateOfBirth,
					age: person.personalInfo?.age,
				},
				accessToken,
			};

			authLogger.info(`User registered successfully: ${user.email}`);

			// Notify all admins about the new registration
			const io = (req as any).io;
			prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } })
				.then((admins) => {
					for (const admin of admins) {
						notifyUser(prisma, io, admin.id, {
							type: "SYSTEM",
							title: "New User Registered",
							body: `${firstName} (${email}) just signed up as a new player.`,
							metadata: { userId: user.id, email, role: user.role },
						});
					}
				})
				.catch((err) => authLogger.error(`Admin new-user notification failed: ${err}`));

			const successResponse = buildSuccessResponse(
				constants.SUCCESS.AUTH.REGISTRATION_SUCCESSFUL,
				responseData,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			authLogger.error(`Registration error: ${error}`);
			const errorResponse = buildErrorResponse(
				constants.ERROR.AUTH.ERROR_DURING_REGISTRATION,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// ── LOGIN ──
	const login = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = LoginSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			authLogger.error(`Login validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse(
				constants.ERROR.AUTH.LOGIN_VALIDATION_FAILED,
				400,
				formattedErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		const { email, password } = validation.data;

		try {
			const user = await prisma.user.findUnique({
				where: { email },
				include: { person: true },
			});

			if (!user || !user.password) {
				authLogger.warn(`Login attempt with invalid credentials: ${email}`);
				const errorResponse = buildErrorResponse(
					constants.ERROR.AUTH.INVALID_CREDENTIALS,
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			// Check if account is suspended or archived
			if (user.status === "suspended" || user.status === "archived") {
				authLogger.warn(`Login attempt on ${user.status} account: ${email}`);
				const errorResponse = buildErrorResponse(
					`Account is ${user.status}. Please contact support.`,
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			// Block login if user is under 18
			const dob = user.person?.personalInfo?.dateOfBirth;
			if (dob) {
				const t = new Date();
				const a = t.getFullYear() - dob.getFullYear();
				const m = t.getMonth() - dob.getMonth();
				const age = m < 0 || (m === 0 && t.getDate() < dob.getDate()) ? a - 1 : a;
				if (age < 18) {
					authLogger.warn(`Login blocked for underage account: ${email}`);
					res.status(403).json(
						buildErrorResponse(
							"Access denied. You must be at least 18 years old.",
							403,
						),
					);
					return;
				}
			}

			// Block login if email is not verified
			if (!user.isEmailVerified) {
				authLogger.warn(`Login attempt with unverified email: ${email}`);

				// Auto-send new OTP for verification
				const otpCode = generateOtpCode(config.otp.length);
				const otpExpiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

				await prisma.oTP.create({
					data: {
						userId: user.id,
						email,
						code: otpCode,
						type: "EMAIL_VERIFICATION" as any,
						channel: "EMAIL",
						expiresAt: otpExpiresAt,
					},
				});

				sendOtpEmail(email, otpCode, "EMAIL_VERIFICATION", config.otp.expiryMinutes).catch(
					(err) => authLogger.error(`OTP email failed during login: ${err}`),
				);

				const errorResponse = buildErrorResponse(
					"Email not verified. A new OTP verification code has been sent to your inbox.",
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			// Verify password
			const isPasswordValid = await argon2.verify(user.password, password);
			if (!isPasswordValid) {
				authLogger.warn(`Invalid password for: ${email}`);
				const errorResponse = buildErrorResponse(
					constants.ERROR.AUTH.INVALID_CREDENTIALS,
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			// Generate JWT tokens
			const accessToken = jwt.sign(
				{
					userId: user.id,
					role: user.role,
					email: user.email,
					firstName: user.person?.personalInfo?.firstName,
					lastName: user.person?.personalInfo?.lastName,
				},
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.accessTokenExpiry } as jwt.SignOptions,
			);

			const refreshToken = jwt.sign(
				{ userId: user.id },
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.refreshTokenExpiry } as jwt.SignOptions,
			);

			// Create session
			await prisma.session.create({
				data: {
					userId: user.id,
					token: refreshToken,
					ipAddress: req.ip || req.socket.remoteAddress || "unknown",
					userAgent: req.get("User-Agent") || "unknown",
					expiresAt: new Date(Date.now() + config.jwt.refreshCookieMaxAge),
				},
			});

			// Update last login
			await prisma.user.update({
				where: { id: user.id },
				data: { lastLogin: new Date() },
			});

			// Set cookies
			res.cookie("token", accessToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.cookieMaxAge,
			});

			res.cookie("refreshToken", refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.refreshCookieMaxAge,
				path: "/api/auth/refresh",
			});

			logActivity(req, {
				userId: user.id,
				action: constants.ACTIVITY_LOG.TEMPLATE.ACTIONS.USER_LOGIN,
				description: `${constants.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.USER_LOGGED_IN}: ${user.email}`,
				page: {
					url: req.originalUrl,
					title: constants.ACTIVITY_LOG.TEMPLATE.PAGES.USER_LOGIN,
				},
			});

			logAudit(req, {
				userId: user.id,
				action: constants.AUDIT_LOG.ACTIONS.LOGIN,
				resource: constants.AUDIT_LOG.RESOURCES.AUTH,
				severity: constants.AUDIT_LOG.SEVERITY.LOW,
				entityType: constants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: user.id,
				changesBefore: null,
				changesAfter: { lastLogin: new Date().toISOString() },
				description: `User logged in: ${user.email}`,
			});

			const responseData = {
				user: {
					id: user.id,
					email: user.email,
					userName: user.userName,
					role: user.role,
					isEmailVerified: user.isEmailVerified,
					isPhoneVerified: user.isPhoneVerified,
					person: user.person?.personalInfo
						? {
								firstName: user.person.personalInfo.firstName,
								lastName: user.person.personalInfo.lastName,
								dateOfBirth: user.person.personalInfo.dateOfBirth,
								age: user.person.personalInfo.age,
							}
						: undefined,
				},
				accessToken,
			};

			authLogger.info(`User logged in successfully: ${user.email}`);
			const successResponse = buildSuccessResponse(
				constants.SUCCESS.AUTH.LOGGED_IN_SUCCESSFULLY,
				responseData,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`Login error: ${error}`);
			const errorResponse = buildErrorResponse(constants.ERROR.AUTH.ERROR_DURING_LOGIN, 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── LOGOUT ──
	const logout = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const refreshToken = req.cookies.refreshToken;

			if (refreshToken) {
				// Delete session by token
				await prisma.session.deleteMany({
					where: { token: refreshToken },
				});
			}

			// Clear cookies
			res.clearCookie("token");
			res.clearCookie("refreshToken", { path: "/api/auth/refresh" });

			authLogger.info("User logged out successfully");
			const successResponse = buildSuccessResponse("Logged out successfully", null);
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`Logout error: ${error}`);
			const errorResponse = buildErrorResponse("Error during logout", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── REFRESH TOKEN ──
	const refresh = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const refreshToken = req.cookies.refreshToken;

			if (!refreshToken) {
				const errorResponse = buildErrorResponse(constants.ERROR.AUTH.UNAUTHORIZED, 401);
				res.status(401).json(errorResponse);
				return;
			}

			// Verify refresh token
			const decoded = jwt.verify(refreshToken, config.jwt.secret as jwt.Secret) as {
				userId: string;
			};

			// Check session exists
			const session = await prisma.session.findFirst({
				where: {
					token: refreshToken,
					userId: decoded.userId,
					expiresAt: { gt: new Date() },
				},
			});

			if (!session) {
				const errorResponse = buildErrorResponse(constants.ERROR.AUTH.INVALID_TOKEN, 401);
				res.status(401).json(errorResponse);
				return;
			}

			// Get user
			const user = await prisma.user.findUnique({
				where: { id: decoded.userId },
				include: { person: true },
			});

			if (!user) {
				const errorResponse = buildErrorResponse(constants.ERROR.AUTH.USER_NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Generate new access token
			const newAccessToken = jwt.sign(
				{
					userId: user.id,
					role: user.role,
					email: user.email,
					firstName: user.person?.personalInfo?.firstName,
					lastName: user.person?.personalInfo?.lastName,
				},
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.accessTokenExpiry } as jwt.SignOptions,
			);

			// Rotate refresh token
			const newRefreshToken = jwt.sign(
				{ userId: user.id },
				config.jwt.secret as jwt.Secret,
				{ expiresIn: config.jwt.refreshTokenExpiry } as jwt.SignOptions,
			);

			// Update session with new refresh token
			await prisma.session.update({
				where: { id: session.id },
				data: {
					token: newRefreshToken,
					expiresAt: new Date(Date.now() + config.jwt.refreshCookieMaxAge),
				},
			});

			// Set cookies
			res.cookie("token", newAccessToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.cookieMaxAge,
			});

			res.cookie("refreshToken", newRefreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				maxAge: config.jwt.refreshCookieMaxAge,
				path: "/api/auth/refresh",
			});

			const successResponse = buildSuccessResponse(constants.SUCCESS.AUTH.TOKEN_GENERATED, {
				accessToken: newAccessToken,
			});
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`Token refresh error: ${error}`);
			const errorResponse = buildErrorResponse(constants.ERROR.AUTH.INVALID_TOKEN, 401);
			res.status(401).json(errorResponse);
		}
	};

	// ── CHANGE PASSWORD ──
	const changePassword = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = ChangePasswordSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse(
				constants.ERROR.AUTH.PASSWORD_UPDATE_VALIDATION_FAILED,
				400,
				formattedErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		const { currentPassword, newPassword } = validation.data;
		const userId = (req as any).userId;

		if (!userId) {
			const errorResponse = buildErrorResponse(constants.ERROR.AUTH.UNAUTHORIZED, 401);
			res.status(401).json(errorResponse);
			return;
		}

		try {
			const user = await prisma.user.findUnique({ where: { id: userId } });
			if (!user || !user.password) {
				const errorResponse = buildErrorResponse(constants.ERROR.AUTH.USER_NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const isCurrentValid = await argon2.verify(user.password, currentPassword);
			if (!isCurrentValid) {
				const errorResponse = buildErrorResponse(
					constants.ERROR.AUTH.INVALID_CREDENTIALS,
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			const hashedNewPassword = await argon2.hash(newPassword);
			await prisma.user.update({
				where: { id: userId },
				data: { password: hashedNewPassword },
			});

			logAudit(req, {
				userId,
				action: constants.AUDIT_LOG.ACTIONS.UPDATE,
				resource: constants.AUDIT_LOG.RESOURCES.AUTH,
				severity: constants.AUDIT_LOG.SEVERITY.HIGH,
				entityType: constants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: userId,
				changesBefore: null,
				changesAfter: { passwordChanged: true },
				description: "Password changed",
			});

			authLogger.info(`Password changed for user: ${userId}`);
			const successResponse = buildSuccessResponse(
				constants.SUCCESS.AUTH.PASSWORD_UPDATED_SUCCESSFULLY,
				null,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`Change password error: ${error}`);
			const errorResponse = buildErrorResponse(
				constants.ERROR.AUTH.ERROR_UPDATING_PASSWORD,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// ── GET CURRENT USER (ME) ──
	const me = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).userId;

		if (!userId) {
			const errorResponse = buildErrorResponse(constants.ERROR.AUTH.UNAUTHORIZED, 401);
			res.status(401).json(errorResponse);
			return;
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				include: {
					person: true,
					wallet: true,
					kyc: true,
					agent: true,
				},
			});

			if (!user) {
				const errorResponse = buildErrorResponse(constants.ERROR.AUTH.USER_NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const responseData = {
				id: user.id,
				email: user.email,
				userName: user.userName,
				phoneNumber: user.phoneNumber,
				role: user.role,
				status: user.status,
				avatar: user.avatar,
				isEmailVerified: user.isEmailVerified,
				isPhoneVerified: user.isPhoneVerified,
				lastLogin: user.lastLogin,
				person: user.person?.personalInfo
					? {
							firstName: user.person.personalInfo.firstName,
							lastName: user.person.personalInfo.lastName,
							middleName: user.person.personalInfo.middleName,
							dateOfBirth: user.person.personalInfo.dateOfBirth,
							nationality: user.person.personalInfo.nationality,
							gender: user.person.personalInfo.gender,
						}
					: null,
				wallet: user.wallet
					? {
							id: user.wallet.id,
							balance: user.wallet.balance,
							bonus: user.wallet.bonus,
							currency: user.wallet.currency,
							status: user.wallet.status,
						}
					: null,
				kyc: user.kyc
					? {
							status: user.kyc.status,
							submittedAt: user.kyc.submittedAt,
							reviewedAt: user.kyc.reviewedAt,
						}
					: null,
				agent: user.agent
					? {
							id: user.agent.id,
							role: user.agent.role,
							status: user.agent.status,
							commissionRate: user.agent.commissionRate,
						}
					: null,
			};

			const successResponse = buildSuccessResponse("User profile retrieved", responseData);
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`Get profile error: ${error}`);
			const errorResponse = buildErrorResponse(
				constants.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// ── REQUEST OTP ──
	const requestOtp = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = RequestOtpSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const { email, phone, type } = validation.data;

		try {
			const code = generateOtpCode(config.otp.length);
			const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

			// Find user by email or phone
			let userId: string | undefined;
			if (email) {
				const user = await prisma.user.findUnique({ where: { email } });
				userId = user?.id;
			}

			await prisma.oTP.create({
				data: {
					userId,
					email: email || undefined,
					phone: phone || undefined,
					code,
					type: type as any,
					channel: phone ? "SMS" : "EMAIL",
					expiresAt,
				},
			});

			authLogger.info(`OTP generated for ${email || phone}`);

			// ── Send OTP via email ──
			if (email) {
				const emailSent = await sendOtpEmail(
					email,
					code,
					type as string,
					config.otp.expiryMinutes,
				);
				if (!emailSent) {
					authLogger.warn(`OTP email delivery failed for ${email}`);
				}
			}

			// TODO: Send OTP via SMS when phone is provided

			const successResponse = buildSuccessResponse("OTP sent successfully", {
				expiresAt,
				...(process.env.NODE_ENV !== "production" ? { code } : {}), // Only show code in dev
			});
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`OTP request error: ${error}`);
			const errorResponse = buildErrorResponse("Error sending OTP", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── VERIFY OTP ──
	const verifyOtp = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = VerifyOtpSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const { email, phone, code, type } = validation.data;

		try {
			const otp = await prisma.oTP.findFirst({
				where: {
					...(email ? { email } : {}),
					...(phone ? { phone } : {}),
					type: type as any,
					verified: false,
					expiresAt: { gt: new Date() },
				},
				orderBy: { createdAt: "desc" },
			});

			if (!otp) {
				const errorResponse = buildErrorResponse("Invalid or expired OTP", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (otp.attempts >= config.otp.maxAttempts) {
				const errorResponse = buildErrorResponse("Maximum OTP attempts exceeded", 429);
				res.status(429).json(errorResponse);
				return;
			}

			const codeBuffer = Buffer.from(otp.code);
			const inputBuffer = Buffer.from(code);
			const isCodeValid =
				codeBuffer.length === inputBuffer.length &&
				crypto.timingSafeEqual(codeBuffer, inputBuffer);

			if (!isCodeValid) {
				await prisma.oTP.update({
					where: { id: otp.id },
					data: { attempts: { increment: 1 } },
				});
				const errorResponse = buildErrorResponse("Invalid OTP code", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Mark OTP as verified
			await prisma.oTP.update({
				where: { id: otp.id },
				data: { verified: true },
			});

			// Update user verification status
			if (otp.userId) {
				const updateData: any = {};
				if (type === "EMAIL_VERIFICATION") updateData.isEmailVerified = true;
				if (type === "PHONE_VERIFICATION") updateData.isPhoneVerified = true;

				if (Object.keys(updateData).length > 0) {
					await prisma.user.update({
						where: { id: otp.userId },
						data: updateData,
					});
				}
			}

			const successResponse = buildSuccessResponse("OTP verified successfully", {
				verified: true,
				type,
			});
			res.status(200).json(successResponse);
		} catch (error) {
			authLogger.error(`OTP verification error: ${error}`);
			const errorResponse = buildErrorResponse("Error verifying OTP", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── GET ALL USERS (Admin) ──
	const getAllUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const role = (req as any).role;
		if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
			res.status(403).json(buildErrorResponse("Forbidden", 403));
			return;
		}

		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 50;
		const skip = (page - 1) * limit;
		const search = (req.query.search as string) || "";
		const statusFilter = req.query.status as string | undefined;
		const roleFilter = req.query.role as string | undefined;

		try {
			const where: any = { isDeleted: false };

			if (search) {
				where.OR = [
					{ email: { contains: search, mode: "insensitive" } },
					{ userName: { contains: search, mode: "insensitive" } },
					{ phoneNumber: { contains: search } },
				];
			}
			if (statusFilter) where.status = statusFilter;
			if (roleFilter) where.role = roleFilter;

			const [users, total] = await Promise.all([
				prisma.user.findMany({
					where,
					skip,
					take: limit,
					orderBy: { createdAt: "desc" },
					include: {
						person: true,
						wallet: true,
						kyc: true,
					},
				}),
				prisma.user.count({ where }),
			]);

			const mapped = users.map((u) => ({
				id: u.id,
				email: u.email,
				userName: u.userName,
				phoneNumber: u.phoneNumber,
				role: u.role,
				status: u.status,
				avatar: u.avatar,
				isEmailVerified: u.isEmailVerified,
				isPhoneVerified: u.isPhoneVerified,
				lastLogin: u.lastLogin,
				createdAt: u.createdAt,
				person: u.person?.personalInfo
					? {
							firstName: u.person.personalInfo.firstName ?? "",
							lastName: u.person.personalInfo.lastName ?? "",
							middleName: u.person.personalInfo.middleName ?? "",
						}
					: null,
				wallet: u.wallet
					? {
							id: u.wallet.id,
							balance: u.wallet.balance,
							status: u.wallet.status,
						}
					: null,
				kyc: u.kyc
					? {
							id: u.kyc.id,
							status: u.kyc.status,
							submittedAt: u.kyc.submittedAt,
						}
					: null,
			}));

			const totalPages = Math.ceil(total / limit);

			res.status(200).json(
				buildSuccessResponse("Users retrieved", {
					users: mapped,
					count: total,
					pagination: { page, limit, totalPages, total },
				}),
			);
		} catch (error) {
			authLogger.error(`getAllUsers error: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	return {
		register,
		login,
		logout,
		refresh,
		changePassword,
		me,
		requestOtp,
		verifyOtp,
		getAllUsers,
	};
};
