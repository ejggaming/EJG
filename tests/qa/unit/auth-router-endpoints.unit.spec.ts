import { expect } from "chai";
import express, { Request, Response, Router } from "express";
import request from "supertest";
import { router as buildAuthRouter } from "../../../app/auth/auth.router";

interface IAuthController {
	register(req: Request, res: Response): Promise<void>;
	login(req: Request, res: Response): Promise<void>;
	logout(req: Request, res: Response): Promise<void>;
	refresh(req: Request, res: Response): Promise<void>;
	changePassword(req: Request, res: Response): Promise<void>;
	me(req: Request, res: Response): Promise<void>;
	requestOtp(req: Request, res: Response): Promise<void>;
	verifyOtp(req: Request, res: Response): Promise<void>;
	getAllUsers(req: Request, res: Response): Promise<void>;
}

const ok =
	() =>
	async (_req: Request, res: Response): Promise<void> => {
		res.status(200).json({ status: "ok" });
	};

describe("QA Unit - Auth Router Endpoint Matrix", () => {
	it("exposes all auth endpoints with expected baseline status codes", async () => {
		const app = express();
		app.use(express.json());
		app.use((_req, res, next) => {
			(res as any).cookie = () => res;
			next();
		});
		app.use((req, _res, next) => {
			(req as any).cookies = {};
			next();
		});

		const controller: IAuthController = {
			register: ok(),
			login: ok(),
			logout: ok(),
			refresh: ok(),
			changePassword: ok(),
			me: ok(),
			requestOtp: ok(),
			verifyOtp: ok(),
			getAllUsers: ok(),
		};

		const root = Router();
		app.use("/api", buildAuthRouter(root, controller as any));

		const cases: Array<{
			method: "get" | "post";
			path: string;
			expectedStatus: number;
			body?: Record<string, unknown>;
		}> = [
			{ method: "post", path: "/api/auth/register", expectedStatus: 200 },
			{ method: "post", path: "/api/auth/login", expectedStatus: 200 },
			{ method: "post", path: "/api/auth/logout", expectedStatus: 200 },
			{ method: "post", path: "/api/auth/refresh", expectedStatus: 200 },
			{ method: "post", path: "/api/auth/change-password", expectedStatus: 401, body: {} },
			{ method: "get", path: "/api/auth/me", expectedStatus: 401 },
			{ method: "post", path: "/api/auth/otp/request", expectedStatus: 200, body: { email: "qa@example.com" } },
			{
				method: "post",
				path: "/api/auth/otp/verify",
				expectedStatus: 200,
				body: { email: "qa@example.com", code: "123456", type: "EMAIL_VERIFICATION" },
			},
			{ method: "get", path: "/api/auth/users", expectedStatus: 401 },
		];

		for (const endpoint of cases) {
			const req = request(app)[endpoint.method](endpoint.path);
			if (endpoint.body) {
				req.send(endpoint.body);
			}
			const res = await req;
			expect(res.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).to.equal(
				endpoint.expectedStatus,
			);
		}
	});
});
