import { controller } from "../../../app/reports/reports.controller";
import { expect } from "chai";
import { Request, Response } from "express";
import { PrismaClient } from "../../../generated/prisma";
import { computeEntryHash } from "../../../utils/tamperProofAudit";

const TEST_TIMEOUT = 5000;

describe("Reports Controller", () => {
	let reportsController: any;
	let req: Partial<Request>;
	let res: any;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	let headers: Record<string, string>;
	let sendValue: any;

	const mockDraw = {
		id: "draw-001",
		drawType: "MORNING",
		drawDate: new Date("2026-01-01T00:00:00.000Z"),
		scheduledAt: new Date("2026-01-01T02:00:00.000Z"),
		totalBets: 10,
		totalStake: 5000,
		totalPayout: 3500,
		grossProfit: 1500,
		status: "SETTLED",
	};

	const mockGameConfig = {
		id: "config-001",
		isActive: true,
		governmentRate: 0.3,
		payoutMultiplier: 700,
		cobradorRate: 0.15,
		caboRate: 0.05,
		capitalistaRate: 0.02,
		maxNumber: 37,
		minBet: 5,
		maxBet: 1000,
	};

	const mockAuditLog = {
		id: "audit-001",
		action: "SUSPICIOUS_TRANSACTION_ALERT",
		resource: "TRANSACTION",
		resourceId: "tx-001",
		userId: "user-001",
		newValue: {
			transactionId: "tx-001",
			amount: 15000,
			type: "DEPOSIT",
			reasons: ["Large deposit amount: \u20b115,000"],
			severity: "HIGH",
		},
		oldValue: null,
		ipAddress: "127.0.0.1",
		hash: "abc123hash",
		previousHash: null,
		createdAt: new Date(),
		user: { email: "player@example.com", role: "PLAYER" },
	};

	beforeEach(() => {
		prisma = {
			juetengBet: {
				count: async () => 100,
			},
			juetengDraw: {
				aggregate: async () => ({
					_sum: { totalStake: 5000, totalPayout: 3500, grossProfit: 1500 },
				}),
				findMany: async () => [mockDraw],
			},
			transaction: {
				aggregate: async (params: any) => {
					if (params?.where?.type === "DEPOSIT") return { _sum: { amount: 10000 } };
					if (params?.where?.type === "WITHDRAWAL") return { _sum: { amount: 5000 } };
					return { _sum: { amount: 0 } };
				},
				findMany: async () => [],
			},
			user: {
				count: async () => 50,
				findMany: async () => [],
			},
			drawCommission: {
				aggregate: async () => ({ _sum: { amount: 750 } }),
				findMany: async () => [],
			},
			auditLog: {
				findMany: async () => [mockAuditLog],
				count: async () => 1,
				findFirst: async () => null,
				create: async (params: any) => ({ id: "new-audit", ...params.data }),
			},
			juetengConfig: {
				findFirst: async () => mockGameConfig,
			},
			agent: {
				findMany: async () => [],
			},
		};

		reportsController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		headers = {};
		sendValue = undefined;
		req = {
			query: {},
			params: {},
			body: {},
			ip: "127.0.0.1",
			headers: { "user-agent": "test-agent" },
			get: (_header: string) => undefined,
			originalUrl: "/api/reports",
		} as any;

		res = {
			send: (data: any) => {
				sendValue = data;
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
			setHeader: (name: string, value: string) => {
				headers[name] = value;
				return res;
			},
			end: () => res,
		};
	});

	// ─── GET /reports/summary ────────────────────────────────────────────────────
	describe(".getSummary()", () => {
		it("should return reports summary successfully", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("bets");
			expect(sentData.data).to.have.property("revenue");
			expect(sentData.data).to.have.property("payouts");
			expect(sentData.data).to.have.property("net");
		});

		it("should include topAgents and complianceLogs in response", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("topAgents");
			expect(sentData.data).to.have.property("complianceLogs");
			expect(sentData.data.topAgents).to.be.an("array");
			expect(sentData.data.complianceLogs).to.be.an("array");
		});

		it("should map complianceLogs from SUSPICIOUS_TRANSACTION_ALERT audit logs", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			const logs = sentData.data.complianceLogs;
			expect(logs).to.have.length(1);
			expect(logs[0]).to.have.property("type", "Alert");
			expect(logs[0]).to.have.property("severity", "HIGH");
		});

		it("should include timestamp in compliance logs", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			const logs = sentData.data.complianceLogs;
			expect(logs[0]).to.have.property("timestamp");
			expect(logs[0]).to.have.property("user");
		});

		it("should filter by date range when from/to query params provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { from: "2026-01-01", to: "2026-01-31" };
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should calculate profit margin correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.aggregate = async () => ({
				_sum: { totalStake: 10000, totalPayout: 7000, grossProfit: 3000 },
			});
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			// profitMargin = (3000 / 10000) * 100 = 30
			expect(sentData.data.profitMargin).to.equal(30);
		});

		it("should return zero profit margin when no revenue", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.aggregate = async () => ({
				_sum: { totalStake: 0, totalPayout: 0, grossProfit: 0 },
			});
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(sentData.data.profitMargin).to.equal(0);
		});

		it("should use default 30% government rate when no config found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengConfig.findFirst = async () => null;
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			// default govRate = 0.3 → 30%
			expect(sentData.data.govRate).to.equal(30);
		});

		it("should include drawReports in response", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("drawReports");
			expect(sentData.data.drawReports).to.be.an("array");
		});

		it("should include draw stats in drawReports", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			const drawReports = sentData.data.drawReports;
			expect(drawReports).to.have.length(1);
			expect(drawReports[0]).to.have.property("bets");
			expect(drawReports[0]).to.have.property("stake");
			expect(drawReports[0]).to.have.property("margin");
		});

		it("should aggregate topAgents sorted by commission descending", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.drawCommission.findMany = async () => [
				{ agentId: "agent-001", amount: 1500 },
				{ agentId: "agent-002", amount: 3000 },
				{ agentId: "agent-001", amount: 500 },
			];
			prisma.agent.findMany = async () => [
				{ id: "agent-001", role: "COBRADOR", user: { email: "cobrador@example.com", role: "COBRADOR", userName: "cobrador1" } },
				{ id: "agent-002", role: "CABO", user: { email: "cabo@example.com", role: "CABO", userName: "cabo1" } },
			];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			const topAgents = sentData.data.topAgents;
			expect(topAgents).to.have.length(2);
			// agent-002 has 3000 commission → rank 1
			expect(topAgents[0].rank).to.equal(1);
			expect(topAgents[0].commission).to.equal(3000);
			// agent-001 has 2000 commission → rank 2
			expect(topAgents[1].rank).to.equal(2);
			expect(topAgents[1].commission).to.equal(2000);
		});

		it("should include totalDeposits and totalWithdrawals", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(sentData.data).to.have.property("totalDeposits");
			expect(sentData.data).to.have.property("totalWithdrawals");
			expect(sentData.data).to.have.property("totalUsers");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengBet.count = async () => {
				throw new Error("DB connection failed");
			};
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getSummary(req as Request, res, () => {});
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	// ─── GET /reports/export/pcso ─────────────────────────────────────────────────
	describe(".exportPCSO()", () => {
		it("should set text/csv content-type header", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(headers["Content-Type"]).to.equal("text/csv");
		});

		it("should set Content-Disposition header with filename", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(headers["Content-Disposition"]).to.include("attachment");
			expect(headers["Content-Disposition"]).to.include(".csv");
		});

		it("should respond with status 200", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
		});

		it("should include PCSO format title in CSV output", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("JUETENGPH OPERATOR REPORT");
		});

		it("should include summary section in CSV", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Total Bets");
			expect(sendValue).to.include("Gross Revenue");
			expect(sendValue).to.include("Government Share");
			expect(sendValue).to.include("Total Deposits");
		});

		it("should include DRAW BREAKDOWN section in CSV", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("DRAW BREAKDOWN");
		});

		it("should include Generated timestamp in CSV", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Generated,");
		});

		it("should show All time period when no date filter", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("All time");
		});

		it("should filter by date range and include period in CSV", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { from: "2026-01-01", to: "2026-01-31" };
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sendValue).to.include("2026-01-01 to 2026-01-31");
		});

		it("should format MORNING draw type as Morning (11AM)", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findMany = async () => [{ ...mockDraw, drawType: "MORNING" }];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Morning (11AM)");
		});

		it("should format AFTERNOON draw type as Afternoon (4PM)", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findMany = async () => [{ ...mockDraw, drawType: "AFTERNOON" }];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Afternoon (4PM)");
		});

		it("should format EVENING draw type as Evening (9PM)", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findMany = async () => [{ ...mockDraw, drawType: "EVENING" }];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Evening (9PM)");
		});

		it("should include Suspicious Transaction Alerts count", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.count = async () => 5;
			reportsController = controller(prisma as PrismaClient);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(sendValue).to.include("Suspicious Transaction Alerts,5");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findMany = async () => {
				throw new Error("DB connection failed");
			};
			reportsController = controller(prisma as PrismaClient);
			await reportsController.exportPCSO(req as Request, res, () => {});
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	// ─── GET /reports/audit-logs ─────────────────────────────────────────────────
	describe(".getAuditLogs()", () => {
		it("should return paginated audit logs", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("logs");
			expect(sentData.data).to.have.property("count");
		});

		it("should include pagination metadata", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(sentData.data).to.have.property("pagination");
			expect(sentData.data.pagination).to.have.property("page", 1);
			expect(sentData.data.pagination).to.have.property("limit", 10);
		});

		it("should map audit logs with hasHash field", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			const logs = sentData.data.logs;
			expect(logs).to.have.length(1);
			expect(logs[0]).to.have.property("hasHash", true);
		});

		it("should include action and resource fields in each log", async function () {
			this.timeout(TEST_TIMEOUT);
			await reportsController.getAuditLogs(req as Request, res, () => {});
			const log = sentData.data.logs[0];
			expect(log).to.have.property("action");
			expect(log).to.have.property("resource");
			expect(log).to.have.property("userEmail");
		});

		it("should filter by action when action query param provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.auditLog.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [mockAuditLog];
			};
			reportsController = controller(prisma as PrismaClient);
			req.query = { action: "SUSPICIOUS_TRANSACTION_ALERT" };
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(capturedWhere).to.have.property("action", "SUSPICIOUS_TRANSACTION_ALERT");
		});

		it("should filter by date range when from/to provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.auditLog.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [];
			};
			prisma.auditLog.count = async () => 0;
			reportsController = controller(prisma as PrismaClient);
			req.query = { from: "2026-01-01", to: "2026-01-31" };
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(capturedWhere).to.have.property("createdAt");
		});

		it("should cap limit at 100 entries maximum", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedTake: number | undefined;
			prisma.auditLog.findMany = async (params: any) => {
				capturedTake = params.take;
				return [];
			};
			prisma.auditLog.count = async () => 0;
			reportsController = controller(prisma as PrismaClient);
			req.query = { limit: "999" };
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(capturedTake).to.equal(100);
		});

		it("should use System as userEmail when user not attached", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [
				{ ...mockAuditLog, user: null, userId: null },
			];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getAuditLogs(req as Request, res, () => {});
			const logs = sentData.data.logs;
			expect(logs[0].userEmail).to.equal("System");
		});

		it("should use default page 1 and limit 50 when not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedSkip: number | undefined;
			let capturedTake: number | undefined;
			prisma.auditLog.findMany = async (params: any) => {
				capturedSkip = params.skip;
				capturedTake = params.take;
				return [];
			};
			prisma.auditLog.count = async () => 0;
			reportsController = controller(prisma as PrismaClient);
			req.query = {};
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(capturedSkip).to.equal(0);
			expect(capturedTake).to.equal(50);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => {
				throw new Error("DB connection failed");
			};
			reportsController = controller(prisma as PrismaClient);
			await reportsController.getAuditLogs(req as Request, res, () => {});
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	// ─── GET /reports/audit/verify ───────────────────────────────────────────────
	describe(".verifyAudit()", () => {
		it("should return valid chain and 200 when no entries exist", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("valid", true);
			expect(sentData.data.totalChecked).to.equal(0);
		});

		it("should return valid and totalChecked=1 for a single properly hashed entry", async function () {
			this.timeout(TEST_TIMEOUT);
			const createdAt = new Date("2026-01-01T10:00:00.000Z");
			const hash = computeEntryHash({
				previousHash: null,
				action: "TRANSACTION_APPROVED",
				resource: "TRANSACTION",
				resourceId: "tx-001",
				userId: "user-001",
				newValue: null,
				createdAt,
			});
			prisma.auditLog.findMany = async () => [
				{
					id: "entry-001",
					action: "TRANSACTION_APPROVED",
					resource: "TRANSACTION",
					resourceId: "tx-001",
					userId: "user-001",
					newValue: null,
					hash,
					previousHash: null,
					createdAt,
				},
			];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(statusCode).to.equal(200);
			expect(sentData.data.valid).to.equal(true);
			expect(sentData.data.totalChecked).to.equal(1);
		});

		it("should return 409 and invalid=false when hash is tampered", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [
				{
					id: "entry-001",
					action: "TRANSACTION_APPROVED",
					resource: "TRANSACTION",
					resourceId: "tx-001",
					userId: "user-001",
					newValue: null,
					hash: "tampered-wrong-hash",
					previousHash: null,
					createdAt: new Date("2026-01-01T10:00:00.000Z"),
				},
			];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(statusCode).to.equal(409);
			expect(sentData.data.valid).to.equal(false);
			expect(sentData.data.brokenAt).to.equal("entry-001");
		});

		it("should detect broken chain linkage when previousHash doesn't match", async function () {
			this.timeout(TEST_TIMEOUT);
			const createdAt1 = new Date("2026-01-01T10:00:00.000Z");
			const hash1 = computeEntryHash({
				previousHash: null,
				action: "CREATE",
				resource: "WALLET",
				resourceId: "w-001",
				userId: "user-001",
				newValue: null,
				createdAt: createdAt1,
			});
			const createdAt2 = new Date("2026-01-01T10:01:00.000Z");
			const hash2 = computeEntryHash({
				previousHash: hash1,
				action: "DEPOSIT",
				resource: "TRANSACTION",
				resourceId: "tx-001",
				userId: "user-001",
				newValue: null,
				createdAt: createdAt2,
			});
			prisma.auditLog.findMany = async () => [
				{ id: "entry-001", action: "CREATE", resource: "WALLET", resourceId: "w-001", userId: "user-001", newValue: null, hash: hash1, previousHash: null, createdAt: createdAt1 },
				{ id: "entry-002", action: "DEPOSIT", resource: "TRANSACTION", resourceId: "tx-001", userId: "user-001", newValue: null, hash: hash2, previousHash: "wrong-previous-hash", createdAt: createdAt2 },
			];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(statusCode).to.equal(409);
			expect(sentData.data.valid).to.equal(false);
		});

		it("should return null brokenAt when chain is valid", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [];
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(sentData.data.brokenAt).to.be.null;
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => {
				throw new Error("DB connection failed");
			};
			reportsController = controller(prisma as PrismaClient);
			await reportsController.verifyAudit(req as Request, res, () => {});
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});
});
