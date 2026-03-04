import { controller } from "../../../app/drawSchedule/drawSchedule.controller";
import { groupDataByField } from "../../../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("DrawSchedule Controller", () => {
	let drawScheduleController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockDrawSchedule = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration DrawSchedule",
		description: "DrawSchedule for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockDrawSchedules = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration DrawSchedule",
			description: "DrawSchedule for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification DrawSchedule",
			description: "DrawSchedule for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing DrawSchedule",
			description: "DrawSchedule for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic DrawSchedule",
			description: "DrawSchedule without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			drawSchedule: {
				findMany: async (_params: Prisma.DrawScheduleFindManyArgs) => {
					// Return multiple drawSchedules for grouping tests
					if (req.query?.groupBy) {
						return mockDrawSchedules;
					}
					return [mockDrawSchedule];
				},
				count: async (_params: Prisma.DrawScheduleCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockDrawSchedules.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.DrawScheduleFindFirstArgs) =>
					params.where?.id === mockDrawSchedule.id ? mockDrawSchedule : null,
				findUnique: async (params: Prisma.DrawScheduleFindUniqueArgs) =>
					params.where?.id === mockDrawSchedule.id ? mockDrawSchedule : null,
				create: async (params: Prisma.DrawScheduleCreateArgs) => ({
					...mockDrawSchedule,
					...params.data,
				}),
				update: async (params: Prisma.DrawScheduleUpdateArgs) => ({
					...mockDrawSchedule,
					...params.data,
				}),
				delete: async (params: Prisma.DrawScheduleDeleteArgs) => ({
					...mockDrawSchedule,
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

		drawScheduleController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/drawSchedule",
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
		it("should return paginated drawSchedules", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group drawSchedules by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("drawSchedules");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.drawSchedules).to.have.property("email");
			expect(sentData.data.drawSchedules).to.have.property("sms");
			expect(sentData.data.drawSchedules).to.have.property("unassigned");
		});

		it("should group drawSchedules by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name", document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("drawSchedules");
			expect(sentData.data).to.have.property("groupedBy", "name");
			expect(sentData.data.drawSchedules).to.have.property("User Registration DrawSchedule");
			expect(sentData.data.drawSchedules).to.have.property("SMS Notification DrawSchedule");
		});

		it("should handle drawSchedules with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.drawSchedules).to.have.property("unassigned");
			expect(sentData.data.drawSchedules.unassigned).to.be.an("array");
			expect(sentData.data.drawSchedules.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("drawSchedules");
			expect(sentData.data.drawSchedules).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name", document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("drawSchedules");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw an error
			prisma.drawSchedule.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw a non-Prisma error
			prisma.drawSchedule.findMany = async () => {
				throw new Error("Internal server error");
			};

			await drawScheduleController.getAll(req as Request, res, next);
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
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true", document: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a drawSchedule", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };
			await drawScheduleController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockDrawSchedule.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await drawScheduleController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent drawSchedule", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await drawScheduleController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };

			// Mock Prisma to throw an error
			prisma.drawSchedule.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await drawScheduleController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.drawSchedule.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await drawScheduleController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new drawSchedule", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new drawSchedule with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "AFTERNOON",
				scheduledTime: "14:00",
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			// type field not in DrawSchedule schema
		});

		it("should create a new drawSchedule without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "EVENING",
				scheduledTime: "20:00",
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "08:00",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "AFTERNOON",
				scheduledTime: "13:00",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "INVALID_TYPE",
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.drawSchedule.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.drawSchedule.create = async () => {
				throw new Error("Internal server error");
			};

			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update drawSchedule details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "AFTERNOON",
				scheduledTime: "14:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.drawSchedule).to.have.property("id");
		});

		it("should update drawSchedule type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				scheduledTime: "16:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.drawSchedule).to.have.property("id");
		});

		it("should update multiple drawSchedule fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "EVENING",
				scheduledTime: "20:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data.drawSchedule).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "MORNING",
				scheduledTime: "07:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "AFTERNOON",
				scheduledTime: "12:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				scheduledTime: "09:00",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "INVALID_ENUM",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent drawSchedule update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				scheduledTime: "09:00",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.drawSchedule.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.params = { id: mockDrawSchedule.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.drawSchedule.update = async () => {
				throw new Error("Internal server error");
			};

			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a drawSchedule", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };
			await drawScheduleController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await drawScheduleController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent drawSchedule deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await drawScheduleController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };

			// Mock Prisma to throw an error
			prisma.drawSchedule.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await drawScheduleController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.drawSchedule.delete = async () => {
				throw new Error("Internal server error");
			};

			await drawScheduleController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long drawSchedule name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "A".repeat(100), // Very long scheduledTime
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in drawSchedule data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "EVENING",
				scheduledTime: "special: !@#$%^&*()",
			};
			req.body = createData;
			await drawScheduleController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				drawType: "MORNING",
				scheduledTime: "09:00",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => drawScheduleController.create(req as Request, res, next));

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
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999", document: "true", count: "true" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await drawScheduleController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };
			req.body = {}; // Empty body
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockDrawSchedule.id };
			req.body = { scheduledTime: "11:00" }; // Only scheduledTime updated
			await drawScheduleController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "DrawSchedule 1", type: "email", category: "marketing" },
		{ id: 2, name: "DrawSchedule 2", type: "sms", category: "notification" },
		{ id: 3, name: "DrawSchedule 3", type: "email", category: "marketing" },
		{ id: 4, name: "DrawSchedule 4", type: null, category: "general" },
		{ id: 5, name: "DrawSchedule 5", type: "push", category: "notification" },
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
				{ id: 1, name: "DrawSchedule 1", type: "email" },
				{ id: 2, name: "DrawSchedule 2" }, // missing type field
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
			expect(result).to.have.property("DrawSchedule 1");
			expect(result).to.have.property("DrawSchedule 2");
			expect(result).to.have.property("DrawSchedule 3");
			expect(result).to.have.property("DrawSchedule 4");
			expect(result).to.have.property("DrawSchedule 5");
			expect(result["DrawSchedule 1"]).to.have.length(1);
		});
	});
});
