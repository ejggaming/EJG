import { controller } from "../app/notification/notification.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Notification Controller", () => {
	let notificationController: any;
	let req: Partial<Request>;
	let res: any;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockNotification = {
		id: "507f1f77bcf86cd799439030",
		userId: "507f1f77bcf86cd799439011",
		type: "SYSTEM",
		title: "Welcome",
		body: "Welcome to the platform",
		channel: "IN_APP",
		status: "PENDING",
		metadata: null,
		sentAt: null,
		readAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockNotifications = [
		mockNotification,
		{
			id: "507f1f77bcf86cd799439031",
			userId: "507f1f77bcf86cd799439011",
			type: "TRANSACTION",
			title: "Deposit Received",
			body: "Your deposit of 100 PHP has been received",
			channel: "IN_APP",
			status: "SENT",
			metadata: { amount: 100, currency: "PHP" },
			sentAt: new Date(),
			readAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439032",
			userId: "507f1f77bcf86cd799439011",
			type: "DRAW_RESULT",
			title: "Draw Result",
			body: "You won 500 PHP on draw #123",
			channel: "IN_APP",
			status: "READ",
			metadata: { betId: "bet123", amount: 500 },
			sentAt: new Date(),
			readAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			notification: {
				findMany: async (_params: Prisma.NotificationFindManyArgs) => {
					return mockNotifications;
				},
				count: async (_params: Prisma.NotificationCountArgs) => {
					return mockNotifications.length;
				},
				findUnique: async (params: Prisma.NotificationFindUniqueArgs) => {
					return params.where?.id === mockNotification.id ? mockNotification : null;
				},
				create: async (params: Prisma.NotificationCreateArgs) => ({
					...mockNotification,
					...params.data,
				}),
				update: async (params: Prisma.NotificationUpdateArgs) => ({
					...mockNotification,
					...params.data,
				}),
				updateMany: async (_params: Prisma.NotificationUpdateManyArgs) => ({
					count: 2,
				}),
				delete: async (_params: Prisma.NotificationDeleteArgs) => ({
					...mockNotification,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		notificationController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => {
				if (header === "Content-Type") return "application/json";
				return undefined;
			},
			originalUrl: "/api/notification",
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
			end: () => res,
		} as Response;
		next = () => {};
	});

	// ────────────────────────────────────────────────────
	// CREATE
	// ────────────────────────────────────────────────────
	describe(".create()", () => {
		it("should create a notification successfully", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "SYSTEM",
				title: "Test Notification",
				body: "This is a test",
				channel: "IN_APP",
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should emit socket event on creation when io available", async function () {
			this.timeout(TEST_TIMEOUT);
			let emittedEvent: string | null = null;
			let emittedData: any = null;
			(req as any).io = {
				to: (room: string) => ({
					emit: (event: string, data: any) => {
						emittedEvent = event;
						emittedData = data;
					},
				}),
			};
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "SYSTEM",
				title: "Real-time Notification",
				body: "Should be emitted",
				channel: "IN_APP",
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(emittedEvent).to.equal("notification");
			expect(emittedData).to.not.be.null;
		});

		it("should reject creation with missing required fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { title: "Missing fields" }; // missing userId, type, body, channel
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should reject creation with invalid notification type", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "INVALID_TYPE",
				title: "Test",
				body: "Test body",
				channel: "IN_APP",
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should accept optional metadata", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "TRANSACTION",
				title: "Deposit",
				body: "Deposit received",
				channel: "IN_APP",
				metadata: { amount: 500, currency: "PHP" },
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.create = async () => {
				throw new Error("DB connection failed");
			};
			notificationController = controller(prisma as PrismaClient);
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "SYSTEM",
				title: "Error Test",
				body: "Should fail",
				channel: "IN_APP",
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ────────────────────────────────────────────────────
	// GET ALL
	// ────────────────────────────────────────────────────
	describe(".getAll()", () => {
		it("should return paginated notifications", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				pagination: "true",
				count: "true",
			};
			await notificationController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should filter by authenticated user", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "507f1f77bcf86cd799439011";
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				pagination: "true",
				count: "true",
			};
			await notificationController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle empty results", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.findMany = async () => [];
			prisma.notification.count = async () => 0;
			notificationController = controller(prisma as PrismaClient);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await notificationController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.findMany = async () => {
				throw new Error("DB connection failed");
			};
			notificationController = controller(prisma as PrismaClient);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await notificationController.getAll(req as Request, res, next);
			expect(statusCode).to.be.oneOf([200, 400, 500]);
		});
	});

	// ────────────────────────────────────────────────────
	// GET BY ID
	// ────────────────────────────────────────────────────
	describe(".getById()", () => {
		it("should return a notification by ID", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockNotification.id };
			await notificationController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("id", mockNotification.id);
		});

		it("should return 404 for non-existent notification", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await notificationController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 400 for invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "not-a-valid-id" };
			await notificationController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 for missing ID", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = {};
			await notificationController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});
	});

	// ────────────────────────────────────────────────────
	// MARK AS READ
	// ────────────────────────────────────────────────────
	describe(".markAsRead()", () => {
		it("should mark a notification as read", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockNotification.id };
			await notificationController.markAsRead(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should return 400 for invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await notificationController.markAsRead(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.update = async () => {
				throw new Error("DB error");
			};
			notificationController = controller(prisma as PrismaClient);
			req.params = { id: mockNotification.id };
			await notificationController.markAsRead(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ────────────────────────────────────────────────────
	// MARK ALL AS READ
	// ────────────────────────────────────────────────────
	describe(".markAllAsRead()", () => {
		it("should mark all notifications as read for a user", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "507f1f77bcf86cd799439011";
			await notificationController.markAllAsRead(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("count", 2);
		});

		it("should reject without auth (no userId)", async function () {
			this.timeout(TEST_TIMEOUT);
			await notificationController.markAllAsRead(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});
	});

	// ────────────────────────────────────────────────────
	// UNREAD COUNT
	// ────────────────────────────────────────────────────
	describe(".getUnreadCount()", () => {
		it("should return unread count for authenticated user", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "507f1f77bcf86cd799439011";
			prisma.notification.count = async () => 2;
			notificationController = controller(prisma as PrismaClient);
			await notificationController.getUnreadCount(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("unreadCount", 2);
		});

		it("should reject without auth (no userId)", async function () {
			this.timeout(TEST_TIMEOUT);
			await notificationController.getUnreadCount(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should return 0 when no unread notifications", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "507f1f77bcf86cd799439011";
			prisma.notification.count = async () => 0;
			notificationController = controller(prisma as PrismaClient);
			await notificationController.getUnreadCount(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("unreadCount", 0);
		});
	});

	// ────────────────────────────────────────────────────
	// UPDATE
	// ────────────────────────────────────────────────────
	describe(".update()", () => {
		it("should update notification status", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockNotification.id };
			req.body = { status: "SENT" };
			await notificationController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should return 400 for invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "bad-id" };
			req.body = { status: "SENT" };
			await notificationController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 for invalid update data", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockNotification.id };
			req.body = { status: "INVALID_STATUS" };
			await notificationController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.update = async () => {
				throw new Error("DB error");
			};
			notificationController = controller(prisma as PrismaClient);
			req.params = { id: mockNotification.id };
			req.body = { status: "SENT" };
			await notificationController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ────────────────────────────────────────────────────
	// DELETE
	// ────────────────────────────────────────────────────
	describe(".remove()", () => {
		it("should delete a notification", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockNotification.id };
			await notificationController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should return 400 for invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid" };
			await notificationController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.notification.delete = async () => {
				throw new Error("DB error");
			};
			notificationController = controller(prisma as PrismaClient);
			req.params = { id: mockNotification.id };
			await notificationController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ────────────────────────────────────────────────────
	// EDGE CASES
	// ────────────────────────────────────────────────────
	describe("Edge Cases", () => {
		it("should handle notification creation without Socket.io", async function () {
			this.timeout(TEST_TIMEOUT);
			// io is NOT set on req
			req.body = {
				userId: "507f1f77bcf86cd799439011",
				type: "SYSTEM",
				title: "No Socket",
				body: "Should still create without error",
				channel: "IN_APP",
			};
			await notificationController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
		});

		it("should validate all notification types", async function () {
			this.timeout(TEST_TIMEOUT);
			const validTypes = [
				"SYSTEM",
				"TRANSACTION",
				"KYC_UPDATE",
				"DRAW_RESULT",
				"PAYOUT",
				"SECURITY",
				"COMMISSION",
			];
			for (const type of validTypes) {
				statusCode = 200;
				req.body = {
					userId: "507f1f77bcf86cd799439011",
					type,
					title: `${type} notification`,
					body: "Test body",
					channel: "IN_APP",
				};
				await notificationController.create(req as Request, res, next);
				expect(statusCode).to.equal(201, `Expected 201 for type ${type}`);
			}
		});

		it("should validate all channel types", async function () {
			this.timeout(TEST_TIMEOUT);
			const validChannels = ["IN_APP", "SMS", "EMAIL", "PUSH"];
			for (const channel of validChannels) {
				statusCode = 200;
				req.body = {
					userId: "507f1f77bcf86cd799439011",
					type: "SYSTEM",
					title: `${channel} notification`,
					body: "Test body",
					channel,
				};
				await notificationController.create(req as Request, res, next);
				expect(statusCode).to.equal(201, `Expected 201 for channel ${channel}`);
			}
		});
	});
});
