import { controller } from "../../../app/juetengDraw/juetengDraw.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../../generated/prisma";

const TEST_TIMEOUT = 8000;

describe("JuetengDraw Lifecycle Actions", () => {
	let drawController: any;
	let req: Partial<Request>;
	let res: any;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockDraw = {
		id: "draw-001",
		drawType: "MORNING",
		drawDate: new Date("2026-03-01T00:00:00.000Z"),
		scheduledAt: new Date("2026-03-01T02:00:00.000Z"),
		status: "SCHEDULED",
		totalBets: 0,
		totalStake: 0,
		totalPayout: 0,
		grossProfit: 0,
		number1: null,
		number2: null,
		combinationKey: null,
		boladorId: null,
		openedAt: null,
		closedAt: null,
		drawnAt: null,
		settledAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockGameConfig = {
		id: "config-001",
		isActive: true,
		maxNumber: 37,
		payoutMultiplier: 700,
		minBet: 5,
		maxBet: 1000,
		cobradorRate: 0.15,
		caboRate: 0.05,
		capitalistaRate: 0.02,
		governmentRate: 0.3,
	};

	const makeBet = (overrides: Partial<typeof mockBet> = {}) => ({
		...mockBet,
		...overrides,
	});

	const mockBet = {
		id: "bet-001",
		drawId: "draw-001",
		bettorId: "user-001",
		number1: 7,
		number2: 13,
		combinationKey: "7-13",
		amount: 100,
		status: "PENDING",
		reference: "BET-001",
		currency: "PHP",
		cobradorId: null,
		caboId: null,
		isWinner: false,
		payoutAmount: null,
		settledAt: null,
		placedAt: new Date(),
		createdAt: new Date(),
	};

	const mockWallet = {
		id: "wallet-001",
		userId: "user-001",
		balance: 5000,
		currency: "PHP",
		status: "ACTIVE",
	};

	beforeEach(() => {
		prisma = {
			juetengDraw: {
				findFirst: async (params: any) => {
					if (params?.where?.id === "draw-001") return { ...mockDraw };
					return null;
				},
				findMany: async () => [mockDraw],
				count: async () => 1,
				create: async (params: any) => ({
					...mockDraw,
					id: "new-draw",
					...params.data,
				}),
				update: async (params: any) => ({ ...mockDraw, ...params.data }),
				delete: async () => ({ ...mockDraw }),
			},
			juetengBet: {
				findMany: async () => [],
				update: async (params: any) => ({ ...mockBet, ...params.data }),
				updateMany: async () => ({ count: 0 }),
				create: async (params: any) => ({ ...mockBet, id: "new-bet", ...params.data }),
				count: async () => 0,
			},
			juetengConfig: {
				findFirst: async () => ({ ...mockGameConfig }),
			},
			juetengPayout: {
				create: async (params: any) => ({ id: "payout-001", ...params.data }),
			},
			drawCommission: {
				create: async (params: any) => ({ id: "comm-001", ...params.data }),
				update: async (params: any) => ({ id: "comm-001", ...params.data }),
			},
			wallet: {
				findUnique: async (params: any) => {
					if (params?.where?.userId === "user-001") return { ...mockWallet };
					return null;
				},
				findFirst: async () => ({ ...mockWallet }),
				update: async (params: any) => ({ ...mockWallet, ...params.data }),
			},
			transaction: {
				create: async (params: any) => ({ id: "tx-001", ...params.data }),
			},
			agent: {
				findMany: async () => [],
				findFirst: async () => null,
			},
			notification: {
				create: async (params: any) => ({ id: "notif-001", ...params.data }),
			},
			autoBetConfig: {
				findMany: async () => [],
				update: async (params: any) => ({ id: "cfg-001", ...params.data }),
			},
			autoBetExecution: {
				findFirst: async () => null,
				create: async (params: any) => ({ id: "exec-001", ...params.data }),
			},
			auditLog: {
				findFirst: async () => null,
				create: async (params: any) => ({ id: "audit-001", ...params.data }),
			},
			user: {
				findMany: async () => [],
			},
			$transaction: async (ops: any) => {
				if (typeof ops === "function") return ops(prisma);
				return await Promise.all(ops);
			},
		};

		drawController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: { id: "draw-001" },
			body: {},
			ip: "127.0.0.1",
			headers: { "user-agent": "test-agent" },
			get: (_header: string) => "application/json",
			originalUrl: "/api/juetengDraw",
		} as any;

		res = {
			send: (data: any) => { sentData = data; return res; },
			status: (code: number) => { statusCode = code; return res; },
			json: (data: any) => { sentData = data; return res; },
			end: () => res,
		};
		next = () => {};
	});

	// ─── POST /juetengDraw/:id/open ──────────────────────────────────────────────
	describe(".open()", () => {
		it("should open a SCHEDULED draw successfully", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SCHEDULED" });
			prisma.juetengDraw.update = async (params: any) => ({
				...mockDraw,
				...params.data,
				id: "draw-001",
			});
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should update draw status to OPEN", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SCHEDULED" });
			let updatedStatus: string | undefined;
			prisma.juetengDraw.update = async (params: any) => {
				updatedStatus = params.data.status;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(updatedStatus).to.equal("OPEN");
		});

		it("should set openedAt timestamp when opening", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SCHEDULED" });
			let capturedData: any;
			prisma.juetengDraw.update = async (params: any) => {
				capturedData = params.data;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(capturedData).to.have.property("openedAt");
		});

		it("should return 422 when draw is not SCHEDULED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(422);
			expect(sentData.message).to.include("SCHEDULED");
		});

		it("should return 422 when draw is already SETTLED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SETTLED" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(422);
		});

		it("should return 404 when draw not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-draw" };
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 400 when id is missing from params", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = {};
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error during update", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SCHEDULED" });
			prisma.juetengDraw.update = async () => { throw new Error("DB error"); };
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.open(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── POST /juetengDraw/:id/close ─────────────────────────────────────────────
	describe(".close()", () => {
		it("should close an OPEN draw successfully", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			prisma.juetengDraw.update = async (params: any) => ({ ...mockDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should update draw status to CLOSED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			let updatedStatus: string | undefined;
			prisma.juetengDraw.update = async (params: any) => {
				updatedStatus = params.data.status;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(updatedStatus).to.equal("CLOSED");
		});

		it("should set closedAt timestamp when closing", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			let capturedData: any;
			prisma.juetengDraw.update = async (params: any) => {
				capturedData = params.data;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(capturedData).to.have.property("closedAt");
		});

		it("should return 422 when draw is not OPEN", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "SCHEDULED" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(422);
			expect(sentData.message).to.include("OPEN");
		});

		it("should return 422 when draw is already CLOSED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(422);
		});

		it("should return 404 when draw not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-draw" };
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 400 when id is missing", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = {};
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error during update", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			prisma.juetengDraw.update = async () => { throw new Error("DB error"); };
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.close(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── POST /juetengDraw/:id/result ────────────────────────────────────────────
	describe(".recordResult()", () => {
		it("should record result for a CLOSED draw", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			prisma.juetengDraw.update = async (params: any) => ({ ...mockDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should compute combinationKey as sorted numbers joined by dash (13-7 → 7-13)", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			let capturedData: any;
			prisma.juetengDraw.update = async (params: any) => {
				capturedData = params.data;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 13, number2: 7 }; // unsorted input
			await drawController.recordResult(req as Request, res, next);
			expect(capturedData.combinationKey).to.equal("7-13");
		});

		it("should update draw status to DRAWN", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			let updatedStatus: string | undefined;
			prisma.juetengDraw.update = async (params: any) => {
				updatedStatus = params.data.status;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(updatedStatus).to.equal("DRAWN");
		});

		it("should set drawnAt timestamp", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			let capturedData: any;
			prisma.juetengDraw.update = async (params: any) => {
				capturedData = params.data;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(capturedData).to.have.property("drawnAt");
		});

		it("should save boladorId when provided", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			let capturedData: any;
			prisma.juetengDraw.update = async (params: any) => {
				capturedData = params.data;
				return { ...mockDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13, boladorId: "bolador-001" };
			await drawController.recordResult(req as Request, res, next);
			expect(capturedData.boladorId).to.equal("bolador-001");
		});

		it("should return 422 when draw is not CLOSED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "OPEN" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(422);
			expect(sentData.message).to.include("CLOSED");
		});

		it("should return 400 when number1 is below 1", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 0, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when number2 exceeds maxNumber", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 50 }; // maxNumber is 37
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when body is missing number fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "draw-001" };
			req.body = {};
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 503 when game config is not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			prisma.juetengConfig.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(503);
		});

		it("should return 404 when draw not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-draw" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 400 when id is missing", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = {};
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...mockDraw, status: "CLOSED" });
			prisma.juetengDraw.update = async () => { throw new Error("DB error"); };
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			req.body = { number1: 7, number2: 13 };
			await drawController.recordResult(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── POST /juetengDraw/:id/settle ────────────────────────────────────────────
	describe(".settle()", () => {
		const drawnDraw = {
			...mockDraw,
			status: "DRAWN",
			combinationKey: "7-13",
			number1: 7,
			number2: 13,
		};

		it("should settle a DRAWN draw with no bets", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [];
			prisma.agent.findMany = async () => [];
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should correctly identify winner and loser bets", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13" });
			const losingBet = makeBet({ id: "bet-002", combinationKey: "5-20" });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet, losingBet];
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.winnerCount).to.equal(1);
			expect(sentData.data.totalBets).to.equal(2);
		});

		it("should compute totalStake as sum of all bet amounts", async function () {
			this.timeout(TEST_TIMEOUT);
			const bet1 = makeBet({ amount: 100 });
			const bet2 = makeBet({ id: "bet-002", combinationKey: "5-20", amount: 50 });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [bet1, bet2];
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(sentData.data.totalStake).to.equal(150);
		});

		it("should compute totalPayout as winning bets * payoutMultiplier", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13", amount: 100 });
			const losingBet = makeBet({ id: "bet-002", combinationKey: "5-20", amount: 50 });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet, losingBet];
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			// totalPayout = 100 * 700 = 70000
			expect(sentData.data.totalPayout).to.equal(70000);
		});

		it("should compute grossProfit as totalStake minus totalPayout", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13", amount: 100 });
			const losingBet = makeBet({ id: "bet-002", combinationKey: "5-20", amount: 50 });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet, losingBet];
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			// grossProfit = 150 - 70000 = -69850
			expect(sentData.data.grossProfit).to.equal(-69850);
		});

		it("should create a juetengPayout record for each winner", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13" });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet];
			let payoutCreated = false;
			prisma.juetengPayout.create = async () => {
				payoutCreated = true;
				return { id: "payout-001" };
			};
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(payoutCreated).to.be.true;
		});

		it("should mark winning bets with isWinner=true and status=WON", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13" });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet];
			const updateCalls: any[] = [];
			prisma.juetengBet.update = async (params: any) => {
				updateCalls.push(params.data);
				return { ...winningBet, ...params.data };
			};
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(updateCalls.some((c) => c.isWinner === true && c.status === "WON")).to.be.true;
		});

		it("should update draw status to SETTLED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			let updatedStatus: string | undefined;
			prisma.juetengDraw.update = async (params: any) => {
				updatedStatus = params.data.status;
				return { ...drawnDraw, ...params.data };
			};
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(updatedStatus).to.equal("SETTLED");
		});

		it("should create cobrador commission when cobradorId is present", async function () {
			this.timeout(TEST_TIMEOUT);
			const bet = makeBet({ cobradorId: "cobrador-001" });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [bet];
			const commissions: any[] = [];
			prisma.drawCommission.create = async (params: any) => {
				commissions.push(params.data);
				return { id: "comm-001", ...params.data };
			};
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(commissions.some((c) => c.type === "COLLECTION")).to.be.true;
		});

		it("should create cabo commission when caboId is present on winning bet", async function () {
			this.timeout(TEST_TIMEOUT);
			const winningBet = makeBet({ combinationKey: "7-13", caboId: "cabo-001" });
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [winningBet];
			const commissions: any[] = [];
			prisma.drawCommission.create = async (params: any) => {
				commissions.push(params.data);
				return { id: "comm-001", ...params.data };
			};
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(commissions.some((c) => c.type === "WINNER_BONUS")).to.be.true;
		});

		it("should create capitalista commission for active CAPITALISTA agents", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => [makeBet({ amount: 100 })];
			prisma.agent.findMany = async (params: any) => {
				if (params?.where?.role === "CAPITALISTA") {
					return [{ id: "cap-001", role: "CAPITALISTA", isActive: true }];
				}
				return [];
			};
			const commissions: any[] = [];
			prisma.drawCommission.create = async (params: any) => {
				commissions.push(params.data);
				return { id: "comm-001", ...params.data };
			};
			prisma.juetengDraw.update = async (params: any) => ({ ...drawnDraw, ...params.data });
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(commissions.some((c) => c.type === "CAPITALISTA")).to.be.true;
		});

		it("should return 422 when draw is not DRAWN", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({
				...mockDraw,
				status: "CLOSED",
				combinationKey: "7-13",
			});
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(422);
		});

		it("should return 422 when draw is missing combinationKey", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({
				...mockDraw,
				status: "DRAWN",
				combinationKey: null,
			});
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(422);
		});

		it("should return 503 when game config is not available", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengConfig.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(503);
		});

		it("should return 404 when draw not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => null;
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-draw" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 400 when id is missing from params", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = {};
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.juetengDraw.findFirst = async () => ({ ...drawnDraw });
			prisma.juetengBet.findMany = async () => { throw new Error("DB error"); };
			drawController = controller(prisma as PrismaClient);
			req.params = { id: "draw-001" };
			await drawController.settle(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});
});
