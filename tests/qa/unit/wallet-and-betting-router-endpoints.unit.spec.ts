import { expect } from "chai";
import express, { Request, Response, Router } from "express";
import request from "supertest";
import { router as buildWalletRouter } from "../../../app/wallet/wallet.router";
import { router as buildJuetengBetRouter } from "../../../app/juetengBet/juetengBet.router";

const ok =
	() =>
	async (_req: Request, res: Response): Promise<void> => {
		res.status(200).json({ status: "ok" });
	};

describe("QA Unit - Wallet and Betting Router Endpoint Matrix", () => {
	it("exposes wallet endpoints", async () => {
		const app = express();
		app.use(express.json());

		const walletController = {
			getById: ok(),
			getAll: ok(),
			create: ok(),
			update: ok(),
			remove: ok(),
			getMyWallet: ok(),
			getMyTransactions: ok(),
			requestDeposit: ok(),
			requestWithdraw: ok(),
			approveTransaction: ok(),
			rejectTransaction: ok(),
			adminGetAllTransactions: ok(),
			adminGetAlerts: ok(),
		};

		const root = Router();
		app.use("/api", buildWalletRouter(root, walletController as any));

		const cases: Array<{
			method: "get" | "post" | "patch" | "delete";
			path: string;
			body?: Record<string, unknown>;
		}> = [
			{ method: "get", path: "/api/wallet/me" },
			{ method: "get", path: "/api/wallet/transactions" },
			{ method: "post", path: "/api/wallet/deposit", body: { amount: 100, paymentMethod: "gcash" } },
			{
				method: "post",
				path: "/api/wallet/withdraw",
				body: { amount: 100, paymentMethod: "gcash", accountNumber: "12345", accountName: "QA" },
			},
			{ method: "patch", path: "/api/wallet/transaction/507f1f77bcf86cd799439011/approve" },
			{
				method: "patch",
				path: "/api/wallet/transaction/507f1f77bcf86cd799439011/reject",
				body: { reason: "qa-reject" },
			},
			{ method: "get", path: "/api/wallet/admin/transactions" },
			{ method: "get", path: "/api/wallet/admin/alerts" },
			{ method: "get", path: "/api/wallet/507f1f77bcf86cd799439011" },
			{ method: "get", path: "/api/wallet" },
			{ method: "post", path: "/api/wallet", body: { userId: "507f1f77bcf86cd799439011" } },
			{ method: "patch", path: "/api/wallet/507f1f77bcf86cd799439011", body: { currency: "PHP" } },
			{ method: "delete", path: "/api/wallet/507f1f77bcf86cd799439011" },
		];

		for (const endpoint of cases) {
			const req = request(app)[endpoint.method](endpoint.path);
			if (endpoint.body) {
				req.send(endpoint.body);
			}
			const res = await req;
			expect(res.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).to.equal(200);
		}
	});

	it("exposes jueteng bet endpoints", async () => {
		const app = express();
		app.use(express.json());

		const juetengBetController = {
			getById: ok(),
			getAll: ok(),
			create: ok(),
			update: ok(),
			remove: ok(),
		};

		const root = Router();
		app.use("/api", buildJuetengBetRouter(root, juetengBetController as any));

		const cases: Array<{
			method: "get" | "post" | "patch" | "delete";
			path: string;
			body?: Record<string, unknown>;
		}> = [
			{ method: "get", path: "/api/juetengBet" },
			{ method: "get", path: "/api/juetengBet/507f1f77bcf86cd799439011" },
			{
				method: "post",
				path: "/api/juetengBet",
				body: { drawId: "507f1f77bcf86cd799439011", number1: 7, number2: 13, amount: 50 },
			},
			{ method: "patch", path: "/api/juetengBet/507f1f77bcf86cd799439011", body: { amount: 100 } },
			{ method: "delete", path: "/api/juetengBet/507f1f77bcf86cd799439011" },
		];

		for (const endpoint of cases) {
			const req = request(app)[endpoint.method](endpoint.path);
			if (endpoint.body) {
				req.send(endpoint.body);
			}
			const res = await req;
			expect(res.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).to.equal(200);
		}
	});
});
