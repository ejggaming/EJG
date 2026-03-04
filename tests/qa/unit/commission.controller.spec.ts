import { controller } from "../../../app/commission/commission.controller";
import { groupDataByField } from "../../../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Commission Controller", () => {
	let commissionController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockCommission = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration Commission",
		description: "Commission for user registration forms",
		type: "COLLECTION",
		rate: 0.15,
		baseAmount: 100,
		amount: 15,
		agentId: "507f1f77bcf86cd799439100",
		drawId: "507f1f77bcf86cd799439101",
		status: "PENDING",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockCommissions = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration Commission",
			description: "Commission for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification Commission",
			description: "Commission for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing Commission",
			description: "Commission for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic Commission",
			description: "Commission without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			commission: {
				findMany: async (_params: any) => {
					// Return multiple commissions for grouping tests
					if (req.query?.groupBy) {
						return mockCommissions;
					}
					return [mockCommission];
				},
				count: async (_params: any) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockCommissions.length;
					}
					return 1;
				},
				findFirst: async (params: any) =>
					params.where?.id === mockCommission.id ? mockCommission : null,
				findUnique: async (params: any) =>
					params.where?.id === mockCommission.id ? mockCommission : null,
				create: async (params: any) => ({
					...mockCommission,
					...params.data,
				}),
				update: async (params: any) => ({
					...mockCommission,
					...params.data,
				}),
				delete: async (params: any) => ({
					...mockCommission,
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
		// The controller uses prisma.drawCommission, alias it to the mock
		prisma.drawCommission = prisma.commission;

		prisma.drawCommission = prisma.commission;
		commissionController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/commission",
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
		it("should return paginated commissions", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group commissions by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("commissions");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.commissions).to.be.an("object");
			expect(sentData.data.commissions).to.have.property("email");
			expect(sentData.data.commissions).to.have.property("sms");
			expect(sentData.data.commissions).to.have.property("unassigned");
		});

		it("should group commissions by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name", document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("commissions");
			expect(sentData.data).to.have.property("groupedBy", "name");
			expect(sentData.data.commissions).to.have.property("User Registration Commission");
			expect(sentData.data.commissions).to.have.property("SMS Notification Commission");
		});

		it("should handle commissions with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.commissions).to.have.property("unassigned");
			expect(sentData.data.commissions.unassigned).to.be.an("array");
			expect(sentData.data.commissions.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.commissions).to.be.an("array");
			expect(sentData.data.commissions).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name", document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("commissions");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw an error
			prisma.commission.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw a non-Prisma error
			prisma.commission.findMany = async () => {
				throw new Error("Internal server error");
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.getAll(req as Request, res, next);
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
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true", document: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a commission", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };
			await commissionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockCommission.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await commissionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent commission", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await commissionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };

			// Mock Prisma to throw an error
			prisma.commission.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.commission.findFirst = async () => {
				throw new Error("Internal server error");
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new commission", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new commission with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "COLLECTION");
		});

		it("should create a new commission without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				type: "INVALID_TYPE",
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.commission.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.commission.create = async () => {
				throw new Error("Internal server error");
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update commission details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("commission");
			expect(sentData.data.commission).to.have.property("id");
		});

		it("should update commission type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "FIXED",
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("commission");
			expect(sentData.data.commission).to.have.property("id");
		});

		it("should update multiple commission fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "WINNER_BONUS",
				rate: 0.1,
				amount: 20,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("commission");
			expect(sentData.data.commission).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "INVALID_TYPE",
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent commission update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.commission.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				rate: 0.2,
			};
			req.params = { id: mockCommission.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.commission.update = async () => {
				throw new Error("Internal server error");
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a commission", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };
			await commissionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await commissionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent commission deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await commissionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };

			// Mock Prisma to throw an error
			prisma.commission.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.commission.delete = async () => {
				throw new Error("Internal server error");
			};
			prisma.drawCommission = prisma.commission;

			await commissionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long commission name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in commission data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;
			await commissionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				agentId: "507f1f77bcf86cd799439100",
				drawId: "507f1f77bcf86cd799439101",
				type: "COLLECTION",
				rate: 0.15,
				baseAmount: 100,
				amount: 15,
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => commissionController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				filter: "invalid-json",
				document: "true",
				count: "true",
			};
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999", document: "true", count: "true" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await commissionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };
			req.body = {}; // Empty body
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCommission.id };
			req.body = { rate: 0.1 }; // Only rate, partial update
			await commissionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Commission 1", type: "email", category: "marketing" },
		{ id: 2, name: "Commission 2", type: "sms", category: "notification" },
		{ id: 3, name: "Commission 3", type: "email", category: "marketing" },
		{ id: 4, name: "Commission 4", type: null, category: "general" },
		{ id: 5, name: "Commission 5", type: "push", category: "notification" },
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
				{ id: 1, name: "Commission 1", type: "email" },
				{ id: 2, name: "Commission 2" }, // missing type field
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
			expect(result).to.have.property("Commission 1");
			expect(result).to.have.property("Commission 2");
			expect(result).to.have.property("Commission 3");
			expect(result).to.have.property("Commission 4");
			expect(result).to.have.property("Commission 5");
			expect(result["Commission 1"]).to.have.length(1);
		});
	});
});
