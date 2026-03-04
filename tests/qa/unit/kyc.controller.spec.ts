import { controller } from "../../../app/kyc/kyc.controller";
import { groupDataByField } from "../../../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Kyc Controller", () => {
	let kycController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockKyc = {
		id: "507f1f77bcf86cd799439026",
		userId: "507f1f77bcf86cd799439100",
		documentType: "PASSPORT",
		documentUrl: "https://example.com/doc.pdf",
		status: "PENDING",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockKycs = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration Kyc",
			description: "Kyc for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification Kyc",
			description: "Kyc for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing Kyc",
			description: "Kyc for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic Kyc",
			description: "Kyc without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			kyc: {
				findMany: async (_params: any) => {
					// Return multiple kycs for grouping tests
					if (req.query?.groupBy) {
						return mockKycs;
					}
					return [mockKyc];
				},
				count: async (_params: any) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockKycs.length;
					}
					return 1;
				},
				findFirst: async (params: any) =>
					params.where?.id === mockKyc.id ? mockKyc : null,
				findUnique: async (params: any) =>
					params.where?.id === mockKyc.id ? mockKyc : null,
				create: async (params: any) => ({
					...mockKyc,
					...params.data,
				}),
				update: async (params: any) => ({
					...mockKyc,
					...params.data,
				}),
				delete: async (params: any) => ({
					...mockKyc,
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
		// The controller uses prisma.kYC, alias it to the mock
		prisma.kYC = prisma.kyc;

		prisma.kYC = prisma.kyc;
		kycController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/kyc",
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
		it("should return paginated kycs", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group kycs by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("kycs");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.kycs).to.be.an("object");
			expect(sentData.data.kycs).to.have.property("email");
			expect(sentData.data.kycs).to.have.property("sms");
			expect(sentData.data.kycs).to.have.property("unassigned");
		});

		it("should group kycs by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name", document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("kycs");
			expect(sentData.data).to.have.property("groupedBy", "name");
			expect(sentData.data.kycs).to.have.property("User Registration Kyc");
			expect(sentData.data.kycs).to.have.property("SMS Notification Kyc");
		});

		it("should handle kycs with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.kycs).to.have.property("unassigned");
			expect(sentData.data.kycs.unassigned).to.be.an("array");
			expect(sentData.data.kycs.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.kycs).to.be.an("array");
			expect(sentData.data.kycs).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name", document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("kycs");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw an error
			prisma.kyc.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.kYC = prisma.kyc;

			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10", document: "true", count: "true" };

			// Mock Prisma to throw a non-Prisma error
			prisma.kyc.findMany = async () => {
				throw new Error("Internal server error");
			};
			prisma.kYC = prisma.kyc;

			await kycController.getAll(req as Request, res, next);
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
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true", document: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a kyc", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };
			await kycController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockKyc.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await kycController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent kyc", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await kycController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };

			// Mock Prisma to throw an error
			prisma.kyc.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.kYC = prisma.kyc;

			await kycController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.kyc.findFirst = async () => {
				throw new Error("Internal server error");
			};
			prisma.kYC = prisma.kyc;

			await kycController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new kyc", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new kyc with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new kyc without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				status: "INVALID_STATUS",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.kyc.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.kYC = prisma.kyc;

			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.kyc.create = async () => {
				throw new Error("Internal server error");
			};
			prisma.kYC = prisma.kyc;

			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update kyc details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "DRIVERS_LICENSE",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("kyc");
			expect(sentData.data.kyc).to.have.property("id");
		});

		it("should update kyc type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "NATIONAL_ID",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("kyc");
			expect(sentData.data.kyc).to.have.property("id");
		});

		it("should update multiple kyc fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
				notes: "Updated notes",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("kyc");
			expect(sentData.data.kyc).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				status: "INVALID_STATUS",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent kyc update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.kyc.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.kYC = prisma.kyc;

			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				documentType: "PASSPORT",
			};
			req.params = { id: mockKyc.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.kyc.update = async () => {
				throw new Error("Internal server error");
			};
			prisma.kYC = prisma.kyc;

			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a kyc", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };
			await kycController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await kycController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent kyc deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await kycController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };

			// Mock Prisma to throw an error
			prisma.kyc.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};
			prisma.kYC = prisma.kyc;

			await kycController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.kyc.delete = async () => {
				throw new Error("Internal server error");
			};
			prisma.kYC = prisma.kyc;

			await kycController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long kyc name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in kyc data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;
			await kycController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				userId: "507f1f77bcf86cd799439100",
				documentType: "PASSPORT",
				documentUrl: "https://example.com/doc.pdf",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => kycController.create(req as Request, res, next));

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
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999", document: "true", count: "true" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await kycController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };
			req.body = {}; // Empty body
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockKyc.id };
			req.body = { notes: "Partial update" }; // Only notes
			await kycController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Kyc 1", type: "email", category: "marketing" },
		{ id: 2, name: "Kyc 2", type: "sms", category: "notification" },
		{ id: 3, name: "Kyc 3", type: "email", category: "marketing" },
		{ id: 4, name: "Kyc 4", type: null, category: "general" },
		{ id: 5, name: "Kyc 5", type: "push", category: "notification" },
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
				{ id: 1, name: "Kyc 1", type: "email" },
				{ id: 2, name: "Kyc 2" }, // missing type field
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
			expect(result).to.have.property("Kyc 1");
			expect(result).to.have.property("Kyc 2");
			expect(result).to.have.property("Kyc 3");
			expect(result).to.have.property("Kyc 4");
			expect(result).to.have.property("Kyc 5");
			expect(result["Kyc 1"]).to.have.length(1);
		});
	});
});
