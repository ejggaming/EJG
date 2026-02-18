import { controller } from "../app/auth/auth.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Auth Controller", () => {
	let authController: any;
	let req: Partial<Request>;
	let res: any;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	let cookiesSet: Record<string, any>;
	let cookiesCleared: string[];

	const mockPerson = {
		id: "507f1f77bcf86cd799439010",
		personalInfo: {
			firstName: "Juan",
			lastName: "Dela Cruz",
			middleName: null,
		},
		contactInfo: {
			email: "juan@example.com",
			phones: [{ type: "mobile", number: "+639171234567", isPrimary: true }],
			address: [],
		},
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockUser = {
		id: "507f1f77bcf86cd799439011",
		personId: mockPerson.id,
		email: "juan@example.com",
		userName: "juandc",
		phoneNumber: "+639171234567",
		// Simulated argon2-hashed password for "Password123!"
		password: "$argon2id$v=19$m=65536,t=3,p=4$hash$hash",
		role: "PLAYER",
		loginMethod: "email",
		status: "active",
		avatar: null,
		isEmailVerified: false,
		isPhoneVerified: false,
		lastLogin: null,
		person: mockPerson,
		wallet: {
			id: "507f1f77bcf86cd799439012",
			balance: 0,
			bonus: 0,
			currency: "PHP",
			status: "active",
		},
		kyc: null,
		agent: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockSession = {
		id: "507f1f77bcf86cd799439013",
		userId: mockUser.id,
		token: "mock-refresh-token",
		ipAddress: "127.0.0.1",
		userAgent: "test-agent",
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		createdAt: new Date(),
	};

	const mockOtp = {
		id: "507f1f77bcf86cd799439014",
		userId: mockUser.id,
		email: mockUser.email,
		phone: null,
		code: "123456",
		type: "EMAIL_VERIFICATION",
		channel: "EMAIL",
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		verified: false,
		attempts: 0,
		createdAt: new Date(),
	};

	beforeEach(() => {
		cookiesSet = {};
		cookiesCleared = [];

		prisma = {
			person: {
				create: async (params: any) => ({
					...mockPerson,
					...params.data,
				}),
			},
			user: {
				findFirst: async (_params: any) => null,
				findUnique: async (params: any) => {
					if (params.where?.email === mockUser.email) return mockUser;
					if (params.where?.id === mockUser.id) return mockUser;
					return null;
				},
				create: async (params: any) => ({
					...mockUser,
					...params.data,
				}),
				update: async (params: any) => ({
					...mockUser,
					...params.data,
				}),
			},
			wallet: {
				create: async (params: any) => ({
					...mockUser.wallet,
					...params.data,
				}),
			},
			session: {
				create: async (params: any) => ({
					...mockSession,
					...params.data,
				}),
				findFirst: async (_params: any) => mockSession,
				update: async (params: any) => ({
					...mockSession,
					...params.data,
				}),
				deleteMany: async (_params: any) => ({ count: 1 }),
			},
			oTP: {
				create: async (params: any) => ({
					...mockOtp,
					...params.data,
				}),
				findFirst: async (_params: any) => mockOtp,
				update: async (params: any) => ({
					...mockOtp,
					...params.data,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		authController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			cookies: {},
			ip: "127.0.0.1",
			socket: { remoteAddress: "127.0.0.1" } as any,
			get: (header: string) => {
				if (header === "Content-Type") return "application/json";
				if (header === "User-Agent") return "test-agent";
				return undefined;
			},
			originalUrl: "/api/auth",
		} as any;
		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			cookie: (name: string, value: any, options: any) => {
				cookiesSet[name] = { value, options };
				return res;
			},
			clearCookie: (name: string, _options?: any) => {
				cookiesCleared.push(name);
				return res;
			},
			end: () => res,
		};
		next = () => {};
	});

	// ────────────────────────────────────────────────────
	// REGISTER
	// ────────────────────────────────────────────────────
	describe(".register()", () => {
		it("should register a new user successfully", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				email: "newuser@example.com",
				password: "StrongPass123!",
				firstName: "Maria",
				lastName: "Santos",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("user");
			expect(sentData.data).to.have.property("accessToken");
			expect(sentData.data.user).to.have.property("email");
		});

		it("should set httpOnly cookies on successful registration", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				email: "newuser@example.com",
				password: "StrongPass123!",
				firstName: "Maria",
				lastName: "Santos",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(cookiesSet).to.have.property("token");
			expect(cookiesSet).to.have.property("refreshToken");
			expect(cookiesSet.token.options).to.have.property("httpOnly", true);
			expect(cookiesSet.refreshToken.options).to.have.property("httpOnly", true);
		});

		it("should reject registration with missing required fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { email: "test@example.com" }; // missing password, firstName, lastName, role
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject registration with invalid email", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				email: "not-an-email",
				password: "StrongPass123!",
				firstName: "Test",
				lastName: "User",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject registration when user already exists", async function () {
			this.timeout(TEST_TIMEOUT);
			// Mock findFirst to return existing user
			prisma.user.findFirst = async () => mockUser;
			authController = controller(prisma as PrismaClient);

			req.body = {
				email: mockUser.email,
				password: "StrongPass123!",
				firstName: "Juan",
				lastName: "Dela Cruz",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(409);
			expect(sentData).to.have.property("status", "error");
		});

		it("should accept registration with optional phone number", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				email: "withphone@example.com",
				password: "StrongPass123!",
				firstName: "Maria",
				lastName: "Santos",
				phoneNumber: "+639171234567",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(201);
		});
	});

	// ────────────────────────────────────────────────────
	// LOGIN
	// ────────────────────────────────────────────────────
	describe(".login()", () => {
		it("should reject login with missing credentials", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject login with invalid email format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { email: "bad", password: "pass" };
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject login for non-existent user", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => null;
			authController = controller(prisma as PrismaClient);
			req.body = { email: "nonexistent@example.com", password: "SomePass1!" };
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(401);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject login for suspended account", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => ({
				...mockUser,
				status: "suspended",
			});
			authController = controller(prisma as PrismaClient);
			req.body = { email: mockUser.email, password: "Password123!" };
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should reject login for archived account", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => ({
				...mockUser,
				status: "archived",
			});
			authController = controller(prisma as PrismaClient);
			req.body = { email: mockUser.email, password: "Password123!" };
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});
	});

	// ────────────────────────────────────────────────────
	// LOGOUT
	// ────────────────────────────────────────────────────
	describe(".logout()", () => {
		it("should clear cookies on logout", async function () {
			this.timeout(TEST_TIMEOUT);
			req.cookies = { refreshToken: "some-token" };
			await authController.logout(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(cookiesCleared).to.include("token");
			expect(cookiesCleared).to.include("refreshToken");
		});

		it("should succeed even without refresh token cookie", async function () {
			this.timeout(TEST_TIMEOUT);
			req.cookies = {};
			await authController.logout(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should delete session when refresh token present", async function () {
			this.timeout(TEST_TIMEOUT);
			let sessionDeleted = false;
			prisma.session.deleteMany = async () => {
				sessionDeleted = true;
				return { count: 1 };
			};
			authController = controller(prisma as PrismaClient);
			req.cookies = { refreshToken: "existing-token" };
			await authController.logout(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sessionDeleted).to.be.true;
		});
	});

	// ────────────────────────────────────────────────────
	// REFRESH TOKEN
	// ────────────────────────────────────────────────────
	describe(".refresh()", () => {
		it("should reject refresh without token cookie", async function () {
			this.timeout(TEST_TIMEOUT);
			req.cookies = {};
			await authController.refresh(req as Request, res, next);
			expect(statusCode).to.equal(401);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject refresh with invalid token", async function () {
			this.timeout(TEST_TIMEOUT);
			req.cookies = { refreshToken: "invalid-jwt-token" };
			await authController.refresh(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});
	});

	// ────────────────────────────────────────────────────
	// CHANGE PASSWORD
	// ────────────────────────────────────────────────────
	describe(".changePassword()", () => {
		it("should reject change password with missing fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			(req as any).userId = mockUser.id;
			await authController.changePassword(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject change password without auth (no userId)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				currentPassword: "OldPass123!",
				newPassword: "NewPass456!",
			};
			// userId is not set
			await authController.changePassword(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should reject change password for non-existent user", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => null;
			authController = controller(prisma as PrismaClient);
			(req as any).userId = "nonexistent-id";
			req.body = {
				currentPassword: "OldPass123!",
				newPassword: "NewPass456!",
			};
			await authController.changePassword(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});
	});

	// ────────────────────────────────────────────────────
	// GET CURRENT USER (ME)
	// ────────────────────────────────────────────────────
	describe(".me()", () => {
		it("should return user profile when authenticated", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = mockUser.id;
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("email", mockUser.email);
			expect(sentData.data).to.have.property("role", mockUser.role);
		});

		it("should reject profile request without auth", async function () {
			this.timeout(TEST_TIMEOUT);
			// userId is not set
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should return 404 for non-existent user", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => null;
			authController = controller(prisma as PrismaClient);
			(req as any).userId = "nonexistent-id";
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should include person data when available", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = mockUser.id;
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("person");
			expect(sentData.data.person).to.have.property("firstName");
			expect(sentData.data.person).to.have.property("lastName");
		});

		it("should include wallet data when available", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = mockUser.id;
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("wallet");
		});
	});

	// ────────────────────────────────────────────────────
	// REQUEST OTP
	// ────────────────────────────────────────────────────
	describe(".requestOtp()", () => {
		it("should generate OTP for valid email", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { email: "juan@example.com", type: "EMAIL_VERIFICATION" };
			await authController.requestOtp(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("expiresAt");
		});

		it("should generate OTP for valid phone", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { phone: "+639171234567", type: "PHONE_VERIFICATION" };
			await authController.requestOtp(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should reject OTP request without email or phone", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { type: "EMAIL_VERIFICATION" };
			await authController.requestOtp(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should include OTP code in dev mode", async function () {
			this.timeout(TEST_TIMEOUT);
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = "development";
			req.body = { email: "test@example.com", type: "EMAIL_VERIFICATION" };
			await authController.requestOtp(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("code");
			process.env.NODE_ENV = originalEnv;
		});
	});

	// ────────────────────────────────────────────────────
	// VERIFY OTP
	// ────────────────────────────────────────────────────
	describe(".verifyOtp()", () => {
		it("should reject with missing required fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await authController.verifyOtp(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should reject expired OTP", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.oTP.findFirst = async () => null; // simulate no valid OTP found
			authController = controller(prisma as PrismaClient);
			req.body = {
				email: "test@example.com",
				code: "123456",
				type: "EMAIL_VERIFICATION",
			};
			await authController.verifyOtp(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should reject OTP after max attempts exceeded", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.oTP.findFirst = async () => ({
				...mockOtp,
				attempts: 5, // config.otp.maxAttempts = 5
			});
			authController = controller(prisma as PrismaClient);
			req.body = {
				email: "test@example.com",
				code: "123456",
				type: "EMAIL_VERIFICATION",
			};
			await authController.verifyOtp(req as Request, res, next);
			expect(statusCode).to.equal(429);
		});

		it("should reject invalid OTP code and increment attempts", async function () {
			this.timeout(TEST_TIMEOUT);
			let attemptsIncremented = false;
			prisma.oTP.findFirst = async () => ({ ...mockOtp, code: "654321" });
			prisma.oTP.update = async (params: any) => {
				if (params.data?.attempts?.increment) attemptsIncremented = true;
				return mockOtp;
			};
			authController = controller(prisma as PrismaClient);
			req.body = {
				email: "test@example.com",
				code: "000000", // wrong code
				type: "EMAIL_VERIFICATION",
			};
			await authController.verifyOtp(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(attemptsIncremented).to.be.true;
		});

		it("should verify correct OTP and update user verification", async function () {
			this.timeout(TEST_TIMEOUT);
			let otpVerified = false;
			let userUpdated = false;
			prisma.oTP.findFirst = async () => mockOtp; // code: "123456"
			prisma.oTP.update = async (params: any) => {
				if (params.data?.verified === true) otpVerified = true;
				return { ...mockOtp, verified: true };
			};
			prisma.user.update = async (params: any) => {
				if (params.data?.isEmailVerified === true) userUpdated = true;
				return mockUser;
			};
			authController = controller(prisma as PrismaClient);
			req.body = {
				email: "test@example.com",
				code: "123456",
				type: "EMAIL_VERIFICATION",
			};
			await authController.verifyOtp(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("verified", true);
			expect(otpVerified).to.be.true;
			expect(userUpdated).to.be.true;
		});
	});

	// ────────────────────────────────────────────────────
	// ERROR HANDLING (e.g., Prisma/DB failures)
	// ────────────────────────────────────────────────────
	describe("Error Handling", () => {
		it("should return 500 on register database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.person.create = async () => {
				throw new Error("DB connection failed");
			};
			authController = controller(prisma as PrismaClient);
			req.body = {
				email: "error@example.com",
				password: "StrongPass123!",
				firstName: "Error",
				lastName: "User",
				role: "PLAYER",
			};
			await authController.register(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should return 500 on login database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => {
				throw new Error("DB connection failed");
			};
			authController = controller(prisma as PrismaClient);
			req.body = { email: "error@example.com", password: "Pass123!" };
			await authController.login(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});

		it("should return 500 on OTP request database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.oTP.create = async () => {
				throw new Error("DB connection failed");
			};
			authController = controller(prisma as PrismaClient);
			req.body = { email: "error@example.com", type: "EMAIL_VERIFICATION" };
			await authController.requestOtp(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});

		it("should return 500 on me database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.user.findUnique = async () => {
				throw new Error("DB connection failed");
			};
			authController = controller(prisma as PrismaClient);
			(req as any).userId = mockUser.id;
			await authController.me(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});
});
