import { controller } from "../../../app/wallet/wallet.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Wallet Transactions & Admin Controller", () => {
	let walletController: any;
	let req: Partial<Request>;
	let res: any;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockWallet = {
		id: "wallet-001",
		userId: "user-001",
		balance: 1000,
		bonus: 0,
		currency: "PHP",
		status: "ACTIVE",
		transactions: [],
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockTransaction = {
		id: "tx-001",
		userId: "user-001",
		walletId: "wallet-001",
		type: "DEPOSIT",
		amount: 500,
		balanceBefore: 1000,
		balanceAfter: 1000,
		currency: "PHP",
		status: "PENDING",
		reference: "DEP-001",
		description: "Deposit via gcash",
		metadata: { paymentMethod: "gcash" },
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockAuditEntry = {
		id: "audit-001",
		hash: null,
		previousHash: null,
		createdAt: new Date(),
	};

	beforeEach(() => {
		prisma = {
			wallet: {
				findUnique: async (params: any) => {
					if (params?.where?.userId === "user-001" || params?.where?.id === "wallet-001") {
						return { ...mockWallet };
					}
					return null;
				},
				findFirst: async () => ({ ...mockWallet }),
				findMany: async () => [mockWallet],
				count: async () => 1,
				create: async (params: any) => ({ ...mockWallet, ...params.data }),
				update: async (params: any) => ({ ...mockWallet, ...params.data }),
				delete: async () => ({ ...mockWallet }),
			},
			transaction: {
				create: async (params: any) => ({ ...mockTransaction, ...params.data }),
				findUnique: async (params: any) => {
					if (params?.where?.id === "tx-001") return { ...mockTransaction };
					return null;
				},
				findMany: async () => [mockTransaction],
				count: async () => 1,
				update: async (params: any) => ({ ...mockTransaction, ...params.data }),
			},
			auditLog: {
				findFirst: async () => null,
				create: async (params: any) => ({ ...mockAuditEntry, ...params.data }),
				findMany: async () => [],
				count: async () => 0,
			},
			user: {
				findMany: async () => [],
			},
			notification: {
				create: async (params: any) => ({ id: "notif-001", ...params.data }),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		walletController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			ip: "127.0.0.1",
			headers: { "user-agent": "test-agent" },
			get: (_header: string) => "application/json",
			originalUrl: "/api/wallet",
		} as any;
		res = {
			send: (data: any) => { sentData = data; return res; },
			status: (code: number) => { statusCode = code; return res; },
			json: (data: any) => { sentData = data; return res; },
			setHeader: (_name: string, _value: string) => res,
			end: () => res,
		};
		next = () => {};
	});

	// ─── GET /wallet/me ─────────────────────────────────────────────────────────
	describe(".getMyWallet()", () => {
		it("should return 401 without authentication", async function () {
			this.timeout(TEST_TIMEOUT);
			await walletController.getMyWallet(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should return wallet for authenticated user", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			await walletController.getMyWallet(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("wallet");
		});

		it("should include wallet balance and currency", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			await walletController.getMyWallet(req as Request, res, next);
			expect(sentData.data.wallet).to.have.property("balance");
			expect(sentData.data.wallet).to.have.property("currency");
		});

		it("should include stats object with deposit/withdrawal/winnings totals", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			prisma.transaction.findMany = async () => [
				{ ...mockTransaction, type: "DEPOSIT", status: "COMPLETED", amount: 500 },
				{ ...mockTransaction, id: "tx-002", type: "WITHDRAWAL", status: "COMPLETED", amount: 200 },
				{ ...mockTransaction, id: "tx-003", type: "JUETENG_PAYOUT", status: "COMPLETED", amount: 70000 },
			];
			walletController = controller(prisma as PrismaClient);
			await walletController.getMyWallet(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data).to.have.property("stats");
			expect(sentData.data.stats.totalDeposits).to.equal(500);
			expect(sentData.data.stats.totalWithdrawals).to.equal(200);
			expect(sentData.data.stats.totalWinnings).to.equal(70000);
		});

		it("should return 404 when wallet not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => null;
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "nonexistent-user";
			await walletController.getMyWallet(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			await walletController.getMyWallet(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── GET /wallet/transactions ────────────────────────────────────────────────
	describe(".getMyTransactions()", () => {
		it("should return 401 without authentication", async function () {
			this.timeout(TEST_TIMEOUT);
			await walletController.getMyTransactions(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should return paginated transactions for authenticated user", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.query = { page: "1", limit: "10" };
			await walletController.getMyTransactions(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("transactions");
		});

		it("should include count and pagination in response", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			await walletController.getMyTransactions(req as Request, res, next);
			expect(sentData.data).to.have.property("count");
			expect(sentData.data).to.have.property("pagination");
		});

		it("should filter by transaction type when type param is provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.transaction.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [mockTransaction];
			};
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.query = { type: "DEPOSIT" };
			await walletController.getMyTransactions(req as Request, res, next);
			expect(capturedWhere?.type).to.equal("DEPOSIT");
		});

		it("should scope query to current user's transactions", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.transaction.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [];
			};
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			await walletController.getMyTransactions(req as Request, res, next);
			expect(capturedWhere?.userId).to.equal("user-001");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findMany = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			await walletController.getMyTransactions(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── POST /wallet/deposit ────────────────────────────────────────────────────
	describe(".requestDeposit()", () => {
		it("should return 401 without authentication", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { amount: 500, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should create a PENDING deposit transaction", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { amount: 500, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("transaction");
		});

		it("should return 400 when amount is missing", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when paymentMethod is missing", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { amount: 500 };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 for amount below minimum (\u20b150)", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { amount: 10, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 403 when wallet is not ACTIVE", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => ({ ...mockWallet, status: "SUSPENDED" });
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = { amount: 500, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return 404 when wallet not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => null;
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = { amount: 500, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should accept optional referenceNumber in body", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { amount: 500, paymentMethod: "gcash", referenceNumber: "GCX-12345" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(201);
		});

		it("should return 500 on database error creating transaction", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.create = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = { amount: 500, paymentMethod: "gcash" };
			await walletController.requestDeposit(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── POST /wallet/withdraw ───────────────────────────────────────────────────
	describe(".requestWithdraw()", () => {
		const validWithdrawBody = {
			amount: 200,
			paymentMethod: "gcash",
			accountNumber: "09171234567",
			accountName: "Juan Dela Cruz",
		};

		it("should return 401 without authentication", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = validWithdrawBody;
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(401);
		});

		it("should create a PENDING withdrawal transaction", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = validWithdrawBody;
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("transaction");
		});

		it("should return 400 when required fields are missing", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).userId = "user-001";
			req.body = { amount: 200 };
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when balance is insufficient", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => ({ ...mockWallet, balance: 50 });
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = { ...validWithdrawBody, amount: 200 };
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 403 when wallet is not ACTIVE", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => ({ ...mockWallet, status: "FROZEN" });
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = validWithdrawBody;
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return 404 when wallet not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.wallet.findUnique = async () => null;
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = validWithdrawBody;
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.create = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).userId = "user-001";
			req.body = validWithdrawBody;
			await walletController.requestWithdraw(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── PATCH /wallet/transaction/:id/approve ───────────────────────────────────
	describe(".approveTransaction()", () => {
		it("should return 404 when transaction not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => null;
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-tx" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should approve a PENDING deposit and return 200", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.update = async (params: any) => ({
				...mockTransaction,
				...params.data,
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			(req as any).user = { id: "admin-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should credit wallet balance when deposit is approved", async function () {
			this.timeout(TEST_TIMEOUT);
			let newBalance: number | undefined;
			prisma.wallet.update = async (params: any) => {
				newBalance = params.data.balance;
				return { ...mockWallet, balance: params.data.balance };
			};
			prisma.transaction.update = async (params: any) => ({
				...mockTransaction,
				...params.data,
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(200);
			// mockWallet.balance (1000) + mockTransaction.amount (500) = 1500
			expect(newBalance).to.equal(1500);
		});

		it("should deduct wallet balance when withdrawal is approved", async function () {
			this.timeout(TEST_TIMEOUT);
			const withdrawalTx = { ...mockTransaction, type: "WITHDRAWAL", amount: 200 };
			prisma.transaction.findUnique = async () => withdrawalTx;
			let newBalance: number | undefined;
			prisma.wallet.update = async (params: any) => {
				newBalance = params.data.balance;
				return { ...mockWallet, balance: params.data.balance };
			};
			prisma.transaction.update = async (params: any) => ({
				...withdrawalTx,
				...params.data,
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(200);
			// mockWallet.balance (1000) - amount (200) = 800
			expect(newBalance).to.equal(800);
		});

		it("should return 400 when transaction is already completed", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => ({
				...mockTransaction,
				status: "COMPLETED",
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when withdrawal amount exceeds wallet balance", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => ({
				...mockTransaction,
				type: "WITHDRAWAL",
				amount: 5000, // exceeds mockWallet.balance (1000)
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error during $transaction", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.$transaction = async () => {
				throw new Error("DB error");
			};
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			await walletController.approveTransaction(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── PATCH /wallet/transaction/:id/reject ────────────────────────────────────
	describe(".rejectTransaction()", () => {
		it("should return 404 when transaction not found", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => null;
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "nonexistent-tx" };
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(404);
		});

		it("should reject a PENDING transaction and return 200", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "tx-001" };
			req.body = { reason: "Invalid proof of payment" };
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should reject without a reason", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "tx-001" };
			req.body = {};
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(200);
		});

		it("should set transaction status to FAILED", async function () {
			this.timeout(TEST_TIMEOUT);
			let updatedStatus: string | undefined;
			prisma.transaction.update = async (params: any) => {
				updatedStatus = params.data.status;
				return { ...mockTransaction, ...params.data };
			};
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			req.body = {};
			await walletController.rejectTransaction(req as Request, res, next);
			expect(updatedStatus).to.equal("FAILED");
		});

		it("should return 400 when transaction is already COMPLETED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => ({
				...mockTransaction,
				status: "COMPLETED",
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			req.body = { reason: "Test" };
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 400 when transaction is already FAILED", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findUnique = async () => ({
				...mockTransaction,
				status: "FAILED",
			});
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			req.body = {};
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(400);
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.update = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			req.params = { id: "tx-001" };
			req.body = {};
			await walletController.rejectTransaction(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── GET /wallet/admin/transactions ─────────────────────────────────────────
	describe(".adminGetAllTransactions()", () => {
		it("should return 403 for PLAYER role", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).role = "PLAYER";
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return 403 when no role is set", async function () {
			this.timeout(TEST_TIMEOUT);
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return transactions for ADMIN role", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).role = "ADMIN";
			req.query = { page: "1", limit: "10" };
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("transactions");
		});

		it("should return transactions for SUPER_ADMIN role", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).role = "SUPER_ADMIN";
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(statusCode).to.equal(200);
		});

		it("should filter by type when type query param is provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.transaction.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [];
			};
			prisma.transaction.count = async () => 0;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			req.query = { type: "DEPOSIT" };
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(capturedWhere?.type).to.equal("DEPOSIT");
		});

		it("should filter by status when status query param is provided", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.transaction.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [];
			};
			prisma.transaction.count = async () => 0;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			req.query = { status: "PENDING" };
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(capturedWhere?.status).to.equal("PENDING");
		});

		it("should include pagination in response", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).role = "ADMIN";
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(sentData.data).to.have.property("pagination");
			expect(sentData.data).to.have.property("count");
		});

		it("should include mapped userName and userEmail fields", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findMany = async () => [
				{
					...mockTransaction,
					user: {
						email: "player@example.com",
						person: {
							personalInfo: { firstName: "Juan", lastName: "Dela Cruz" },
						},
					},
				},
			];
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAllTransactions(req as Request, res, next);
			const txs = sentData.data.transactions;
			expect(txs[0].userName).to.equal("Juan Dela Cruz");
			expect(txs[0].userEmail).to.equal("player@example.com");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.transaction.findMany = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAllTransactions(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});

	// ─── GET /wallet/admin/alerts ────────────────────────────────────────────────
	describe(".adminGetAlerts()", () => {
		const mockAlert = {
			id: "audit-001",
			action: "SUSPICIOUS_TRANSACTION_ALERT",
			resource: "TRANSACTION",
			resourceId: "tx-001",
			userId: "user-001",
			newValue: { amount: 15000, type: "DEPOSIT", reasons: ["Large amount"], severity: "HIGH" },
			createdAt: new Date(),
			user: { email: "player@example.com", role: "PLAYER" },
		};

		it("should return 403 for PLAYER role", async function () {
			this.timeout(TEST_TIMEOUT);
			(req as any).role = "PLAYER";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return 403 when no role is set", async function () {
			this.timeout(TEST_TIMEOUT);
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(statusCode).to.equal(403);
		});

		it("should return alerts for ADMIN role", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [mockAlert];
			prisma.auditLog.count = async () => 1;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("alerts");
		});

		it("should return alerts for SUPER_ADMIN role", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [mockAlert];
			prisma.auditLog.count = async () => 1;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "SUPER_ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(statusCode).to.equal(200);
		});

		it("should include pagination and count in response", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [mockAlert];
			prisma.auditLog.count = async () => 1;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(sentData.data).to.have.property("pagination");
			expect(sentData.data).to.have.property("count");
		});

		it("should map alert with correct userEmail", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [
				{ ...mockAlert, user: { email: "flagged@example.com", role: "PLAYER" } },
			];
			prisma.auditLog.count = async () => 1;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(sentData.data.alerts[0].userEmail).to.equal("flagged@example.com");
		});

		it("should use Unknown when user is not attached to alert", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => [{ ...mockAlert, user: null }];
			prisma.auditLog.count = async () => 1;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(sentData.data.alerts[0].userEmail).to.equal("Unknown");
		});

		it("should query only SUSPICIOUS_TRANSACTION_ALERT action entries", async function () {
			this.timeout(TEST_TIMEOUT);
			let capturedWhere: any;
			prisma.auditLog.findMany = async (params: any) => {
				capturedWhere = params.where;
				return [];
			};
			prisma.auditLog.count = async () => 0;
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(capturedWhere?.action).to.equal("SUSPICIOUS_TRANSACTION_ALERT");
		});

		it("should return 500 on database error", async function () {
			this.timeout(TEST_TIMEOUT);
			prisma.auditLog.findMany = async () => { throw new Error("DB error"); };
			walletController = controller(prisma as PrismaClient);
			(req as any).role = "ADMIN";
			await walletController.adminGetAlerts(req as Request, res, next);
			expect(statusCode).to.equal(500);
		});
	});
});
