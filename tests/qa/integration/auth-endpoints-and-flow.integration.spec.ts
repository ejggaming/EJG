import { expect } from "chai";
import { execSync, spawn, ChildProcessWithoutNullStreams } from "child_process";
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "../../../generated/prisma";
import { seedQaFlowData, QA_FLOW_DEFAULTS } from "../../../prisma/seeds/qaFlowSeeder";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test"), override: true });

const prisma = new PrismaClient();
const keepQaData = process.env.QA_KEEP_DATA === "true";

const BASE_URL = "http://127.0.0.1:3001";
let serverProcess: ChildProcessWithoutNullStreams | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url: string, timeoutMs = 120000) {
	const start = Date.now();
	let lastError = "unknown";

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.status > 0) {
				return;
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await sleep(1000);
	}

	throw new Error(`Server did not start in time. Last error: ${lastError}`);
}

function stopServerProcess() {
	if (!serverProcess?.pid) {
		return;
	}

	try {
		if (process.platform === "win32") {
			execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: "ignore" });
		} else {
			process.kill(serverProcess.pid, "SIGTERM");
		}
	} catch {
		// Ignore cleanup errors if process is already gone.
	}
}

function getTokenCookie(response: Response): string {
	const setCookie = (response.headers as any).getSetCookie?.() as string[] | undefined;
	return (
		setCookie?.find((cookie) => cookie.startsWith("token=")) ||
		response.headers.get("set-cookie") ||
		""
	);
}

async function loginAndGetTokenCookie(phoneNumber: string, password: string): Promise<string> {
	const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			phoneNumber,
			password,
		}),
	});

	if (loginRes.status !== 200) {
		const payload = await loginRes.text();
		throw new Error(
			`Login failed for ${phoneNumber}. Status: ${loginRes.status}. Body: ${payload}`,
		);
	}

	const tokenCookie = getTokenCookie(loginRes);
	expect(tokenCookie).to.contain("token=");
	return tokenCookie;
}

async function cleanupUserByEmail(email: string) {
	if (keepQaData) {
		return;
	}

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, personId: true },
	});

	if (!user) {
		return;
	}

	await prisma.session.deleteMany({ where: { userId: user.id } });
	await prisma.oTP.deleteMany({ where: { userId: user.id } });
	await prisma.wallet.deleteMany({ where: { userId: user.id } });
	await prisma.agent.deleteMany({ where: { userId: user.id } });
	await prisma.user.deleteMany({ where: { id: user.id } });
	await prisma.person.deleteMany({ where: { id: user.personId } });
}

describe("QA Integration - Endpoint Matrix and Auth Flow", () => {
	before(async function () {
		this.timeout(180000);
		await seedQaFlowData(prisma);

		serverProcess = spawn("npm", ["run", "start:test:e2e"], {
			cwd: process.cwd(),
			shell: true,
			env: {
				...process.env,
				NODE_ENV: "test",
			},
			stdio: "pipe",
		});

		await waitForServer(`${BASE_URL}/health`);
	});

	after(async () => {
		stopServerProcess();
		await prisma.$disconnect();
	});

	it("covers all auth endpoints with baseline expected statuses", async function () {
		this.timeout(30000);

		const cases: Array<{
			method: "GET" | "POST";
			path: string;
			body?: Record<string, unknown>;
			expectedStatus: number | number[];
		}> = [
			{ method: "GET", path: "/", expectedStatus: 200 },
			{ method: "GET", path: "/health", expectedStatus: [200, 503] },
			{ method: "GET", path: "/api/auth/me", expectedStatus: 401 },
			{ method: "GET", path: "/api/auth/users", expectedStatus: 401 },
			{ method: "POST", path: "/api/auth/register", body: {}, expectedStatus: 400 },
			{ method: "POST", path: "/api/auth/login", body: {}, expectedStatus: 400 },
			{ method: "POST", path: "/api/auth/logout", body: {}, expectedStatus: 200 },
			{ method: "POST", path: "/api/auth/refresh", body: {}, expectedStatus: 401 },
			{ method: "POST", path: "/api/auth/change-password", body: {}, expectedStatus: 401 },
			{ method: "POST", path: "/api/auth/otp/request", body: {}, expectedStatus: 400 },
			{ method: "POST", path: "/api/auth/otp/verify", body: {}, expectedStatus: 400 },
		];

		for (const c of cases) {
			const response = await fetch(`${BASE_URL}${c.path}`, {
				method: c.method,
				headers: {
					"Content-Type": "application/json",
				},
				body: c.body ? JSON.stringify(c.body) : undefined,
			});

			const expectedStatuses = Array.isArray(c.expectedStatus)
				? c.expectedStatus
				: [c.expectedStatus];

			expect(
				expectedStatuses.includes(response.status),
				`${c.method} ${c.path} returned ${response.status}, expected ${expectedStatuses.join(" or ")}`,
			).to.equal(true);
		}
	});

	it("validates auth flow: register -> verify OTP -> login -> me -> logout", async function () {
		this.timeout(60000);

		const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const email = `qa.api.flow+${runId}@example.com`;
		const phoneNumber = `09${runId.slice(-9)}`;
		const password = "QaFlow123!";

		await cleanupUserByEmail(email);

		try {
			const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					password,
					firstName: "QA",
					lastName: "Flow",
					phoneNumber,
					role: "PLAYER",
					dateOfBirth: "1990-01-01",
				}),
			});
			if (registerRes.status !== 201) {
				const payload = await registerRes.text();
				throw new Error(
					`Register failed for ${email}. Status: ${registerRes.status}. Body: ${payload}`,
				);
			}

			const otp = await prisma.oTP.findFirst({
				where: {
					email,
					type: "EMAIL_VERIFICATION",
					verified: false,
				},
				orderBy: { createdAt: "desc" },
			});
			expect(otp).to.not.equal(null);

			const verifyRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					code: otp!.code,
					type: "EMAIL_VERIFICATION",
				}),
			});
			expect(verifyRes.status).to.equal(200);

			const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phoneNumber,
					password,
				}),
			});
			expect(loginRes.status).to.equal(200);

			const tokenCookie = getTokenCookie(loginRes);
			expect(tokenCookie).to.contain("token=");

			const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
				method: "GET",
				headers: {
					Cookie: tokenCookie,
				},
			});
			expect(meRes.status).to.equal(200);

			const meJson = (await meRes.json()) as {
				data?: { email?: string };
			};
			expect(meJson.data?.email).to.equal(email);

			const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
				method: "POST",
				headers: {
					Cookie: tokenCookie,
				},
			});
			expect(logoutRes.status).to.equal(200);
		} finally {
			await cleanupUserByEmail(email);
		}
	});

	it("validates seeded full flow: player deposit -> admin approve -> player bet", async function () {
		this.timeout(90000);

		const seed = await seedQaFlowData(prisma);
		const [betNumber1, betNumber2] = QA_FLOW_DEFAULTS.betNumbers;
		const depositAmount = QA_FLOW_DEFAULTS.depositAmount;
		const betAmount = QA_FLOW_DEFAULTS.betAmount;

		const playerCookie = await loginAndGetTokenCookie(
			seed.player.phoneNumber,
			seed.player.password,
		);
		const adminCookie = await loginAndGetTokenCookie(
			seed.admin.phoneNumber,
			seed.admin.password,
		);

		const walletBefore = await prisma.wallet.findUnique({
			where: { userId: seed.player.id },
		});
		expect(walletBefore).to.not.equal(null);

		const depositRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: playerCookie,
			},
			body: JSON.stringify({
				amount: depositAmount,
				paymentMethod: "gcash",
			}),
		});
		expect(depositRes.status).to.equal(201);
		const depositJson = (await depositRes.json()) as {
			data?: {
				transaction?: { id?: string; status?: string };
			};
		};
		const depositTransactionId = depositJson.data?.transaction?.id;
		expect(depositTransactionId).to.be.a("string");
		expect(depositJson.data?.transaction?.status).to.equal("PENDING");

		const approveRes = await fetch(
			`${BASE_URL}/api/wallet/transaction/${depositTransactionId}/approve`,
			{
				method: "PATCH",
				headers: {
					Cookie: adminCookie,
				},
			},
		);
		expect(approveRes.status).to.equal(200);

		const approvedDeposit = await prisma.transaction.findUnique({
			where: { id: depositTransactionId! },
		});
		expect(approvedDeposit?.status).to.equal("COMPLETED");

		const walletAfterDeposit = await prisma.wallet.findUnique({
			where: { userId: seed.player.id },
		});
		expect(walletAfterDeposit).to.not.equal(null);
		expect(walletAfterDeposit!.balance).to.be.closeTo(
			walletBefore!.balance + depositAmount,
			0.0001,
		);

		const betRes = await fetch(`${BASE_URL}/api/juetengBet`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: playerCookie,
			},
			body: JSON.stringify({
				drawId: seed.openDrawId,
				number1: betNumber1,
				number2: betNumber2,
				amount: betAmount,
			}),
		});
		expect(betRes.status).to.equal(201);
		const betJson = (await betRes.json()) as {
			data?: { id?: string; bettorId?: string; amount?: number };
		};
		expect(betJson.data?.id).to.be.a("string");
		expect(betJson.data?.bettorId).to.equal(seed.player.id);
		expect(betJson.data?.amount).to.equal(betAmount);

		const walletAfterBet = await prisma.wallet.findUnique({
			where: { userId: seed.player.id },
		});
		expect(walletAfterBet).to.not.equal(null);
		expect(walletAfterBet!.balance).to.be.closeTo(
			walletAfterDeposit!.balance - betAmount,
			0.0001,
		);

		const latestBetTransaction = await prisma.transaction.findFirst({
			where: {
				userId: seed.player.id,
				type: "JUETENG_BET",
			},
			orderBy: { createdAt: "desc" },
		});
		expect(latestBetTransaction).to.not.equal(null);
		expect(latestBetTransaction?.status).to.equal("COMPLETED");
		expect(latestBetTransaction?.amount).to.equal(betAmount);
	});
});
