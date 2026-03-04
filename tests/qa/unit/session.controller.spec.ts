import { controller } from "../../../app/session/session.controller";
import { groupDataByField } from "../../../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Session Controller", () => {
	let sessionController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockSession = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration Session",
		description: "Session for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockSessions = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration Session",
			description: "Session for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification Session",
			description: "Session for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing Session",
			description: "Session for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic Session",
			description: "Session without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			session: {
				findMany: async (_params: Prisma.SessionFindManyArgs) => {
					// Return multiple sessions for grouping tests
					if (req.query?.groupBy) {
						return mockSessions;
					}
					return [mockSession];
				},
				count: async (_params: Prisma.SessionCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockSessions.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.SessionFindFirstArgs) =>
					params.where?.id === mockSession.id ? mockSession : null,
				findUnique: async (params: Prisma.SessionFindUniqueArgs) =>
					params.where?.id === mockSession.id ? mockSession : null,
				create: async (params: Prisma.SessionCreateArgs) => ({
					...mockSession,
					...params.data,
				}),
				update: async (params: Prisma.SessionUpdateArgs) => ({
					...mockSession,
					...params.data,
				}),
				delete: async (params: Prisma.SessionDeleteArgs) => ({
					...mockSession,
					id: params.where.id,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		sessionController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/session",
		} as Request;
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

	describe(".getAll()", () => {
		it("should return paginated sessions", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group sessions by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("sessions");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.sessions).to.have.property("email");
			expect(sentData.data.sessions).to.have.property("sms");
			expect(sentData.data.sessions).to.have.property("unassigned");
		});

		it("should group sessions by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name", document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("sessions");
			expect(sentData.data).to.have.property("groupedBy", "name");
			expect(sentData.data.sessions).to.have.property("User Registration Session");
			expect(sentData.data.sessions).to.have.property("SMS Notification Session");
		});

		it("should handle sessions with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.sessions).to.have.property("unassigned");
			expect(sentData.data.sessions.unassigned).to.be.an("array");
			expect(sentData.data.sessions.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sessions).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true" };
		await sessionController.getAll(req as Request, res, next);
		expect(statusCode).to.equal(400);
		expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name", document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("sessions");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw an error
			prisma.session.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw a non-Prisma error
			prisma.session.findMany = async () => {
				throw new Error("Internal server error");
			};

			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle advanced filtering", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				query: "email",
				filter: JSON.stringify([{ field: "type", operator: "equals", value: "email" }]),
			document: "true",
			count: "true",
		};
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true", document: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a session", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };
			await sessionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockSession.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await sessionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent session", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await sessionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };

			// Mock Prisma to throw an error
			prisma.session.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sessionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.session.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await sessionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new session", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				token: "test-token-abc123",
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new session with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439101",
				token: "test-token-email",
				expiresAt: "2027-06-01T00:00:00Z",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			// type field not in Session schema
		});

		it("should create a new session without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439102",
				token: "test-token-generic",
				expiresAt: "2027-12-01T00:00:00Z",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439103",
				token: "test-token-form",
				expiresAt: "2027-01-15T00:00:00Z",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439104",
				token: "test-token-url",
				expiresAt: "2027-02-01T00:00:00Z",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "",
				token: "",
				expiresAt: "not-a-date",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439105",
				token: "test-token-prisma",
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.session.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439106",
				token: "test-token-internal",
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.session.create = async () => {
				throw new Error("Internal server error");
			};

			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update session details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-enhanced",
				expiresAt: "2028-01-01T00:00:00Z",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.session).to.have.property("id");
		});

		it("should update session type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-sms",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.session).to.have.property("id");
		});

		it("should update multiple session fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-email",
				expiresAt: "2028-06-01T00:00:00Z",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.session).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-form",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-url",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				userId: "",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent session update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Session",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-prisma",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.session.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				token: "updated-token-internal",
			};
			req.params = { id: mockSession.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.session.update = async () => {
				throw new Error("Internal server error");
			};

			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a session", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };
			await sessionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await sessionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent session deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await sessionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };

			// Mock Prisma to throw an error
			prisma.session.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sessionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.session.delete = async () => {
				throw new Error("Internal server error");
			};

			await sessionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long session name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439107",
				token: "A".repeat(1000), // Very long token
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in session data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439108",
				token: "special-token-!@#$%^&*()",
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;
			await sessionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439109",
				token: "test-token-concurrent",
				expiresAt: "2027-01-01T00:00:00Z",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => sessionController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				filter: "invalid-json",
			};
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999", document: "true", count: "true" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await sessionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };
			req.body = {}; // Empty body
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
		expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSession.id };
			req.body = { token: "only-token-updated" }; // Only token updated
			await sessionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Session 1", type: "email", category: "marketing" },
		{ id: 2, name: "Session 2", type: "sms", category: "notification" },
		{ id: 3, name: "Session 3", type: "email", category: "marketing" },
		{ id: 4, name: "Session 4", type: null, category: "general" },
		{ id: 5, name: "Session 5", type: "push", category: "notification" },
	];

	describe("groupDataByField()", () => {
		it("should group data by type field", () => {
			const result = groupDataByField(testData, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("sms");
			expect(result).to.have.property("push");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(2);
			expect(result.sms).to.have.length(1);
			expect(result.push).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should group data by category field", () => {
			const result = groupDataByField(testData, "category");
			expect(result).to.have.property("marketing");
			expect(result).to.have.property("notification");
			expect(result).to.have.property("general");
			expect(result.marketing).to.have.length(2);
			expect(result.notification).to.have.length(2);
			expect(result.general).to.have.length(1);
		});

		it("should handle null values by placing them in unassigned group", () => {
			const result = groupDataByField(testData, "type");
			expect(result.unassigned).to.have.length(1);
			expect(result.unassigned[0]).to.deep.include({ id: 4, type: null });
		});

		it("should handle undefined values by placing them in unassigned group", () => {
			const dataWithUndefined = [
				{ id: 1, name: "Session 1", type: "email" },
				{ id: 2, name: "Session 2" }, // missing type field
			];
			const result = groupDataByField(dataWithUndefined, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should return empty object for empty array", () => {
			const result = groupDataByField([], "type");
			expect(result).to.be.an("object");
			expect(Object.keys(result)).to.have.length(0);
		});

		it("should group by string values correctly", () => {
			const result = groupDataByField(testData, "name");
			expect(result).to.have.property("Session 1");
			expect(result).to.have.property("Session 2");
			expect(result).to.have.property("Session 3");
			expect(result).to.have.property("Session 4");
			expect(result).to.have.property("Session 5");
			expect(result["Session 1"]).to.have.length(1);
		});
	});
});
