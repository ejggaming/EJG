import { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { buildSuccessResponse } from "../../helper/success-handler";
import { buildErrorResponse } from "../../helper/error-handler";
import { verifyAuditChain } from "../../utils/tamperProofAudit";

const logger = getLogger();
const reportsLogger = logger.child({ module: "reports" });

export const controller = (prisma: PrismaClient) => {
	const getSummary = async (req: Request, res: Response) => {
		try {
			const { from, to } = req.query as { from?: string; to?: string };

			const dateFilter =
				from && to
					? { createdAt: { gte: new Date(from as string), lte: new Date(to as string) } }
					: {};

			const drawDateFilter =
				from && to
					? { drawDate: { gte: new Date(from as string), lte: new Date(to as string) } }
					: {};

			const [
				totalBets,
				drawAgg,
				depositAgg,
				withdrawalAgg,
				totalUsers,
				commissionAgg,
				drawBreakdown,
				allCommissions,
				complianceAlerts,
			] = await Promise.all([
				prisma.juetengBet.count({ where: dateFilter }),
				prisma.juetengDraw.aggregate({
					_sum: { totalStake: true, totalPayout: true, grossProfit: true },
					where: { status: "SETTLED", ...drawDateFilter },
				}),
				prisma.transaction.aggregate({
					_sum: { amount: true },
					where: { type: "DEPOSIT", status: "COMPLETED", ...dateFilter },
				}),
				prisma.transaction.aggregate({
					_sum: { amount: true },
					where: { type: "WITHDRAWAL", status: "COMPLETED", ...dateFilter },
				}),
				prisma.user.count(),
				prisma.drawCommission.aggregate({
					_sum: { amount: true },
					where: dateFilter,
				}),
				prisma.juetengDraw.findMany({
					where: { status: "SETTLED", ...drawDateFilter },
					select: {
						id: true,
						drawType: true,
						drawDate: true,
						scheduledAt: true,
						totalBets: true,
						totalStake: true,
						totalPayout: true,
						grossProfit: true,
					},
					orderBy: { drawDate: "desc" },
					take: 20,
				}),
				// All commissions for top-agents aggregation
				prisma.drawCommission.findMany({
					where: dateFilter,
					select: { agentId: true, amount: true },
				}),
				// Suspicious transaction alerts (compliance log)
				prisma.auditLog.findMany({
					where: {
						action: "SUSPICIOUS_TRANSACTION_ALERT",
						...dateFilter,
					},
					orderBy: { createdAt: "desc" },
					take: 50,
					include: { user: { select: { email: true, role: true } } },
				}),
			]);

			const grossRevenue = drawAgg._sum.totalStake ?? 0;
			const totalPayouts = drawAgg._sum.totalPayout ?? 0;
			const netRevenue = drawAgg._sum.grossProfit ?? 0;
			const profitMargin = grossRevenue > 0 ? Math.round((netRevenue / grossRevenue) * 1000) / 10 : 0;

			// Get game config for government rate
			const gameConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
			const govRate = gameConfig?.governmentRate ?? 0.3;
			const govShare = Math.round(netRevenue * govRate);

			// ── Top Agents ──────────────────────────────────────────────────────────
			const agentTotals = new Map<string, number>();
			for (const c of allCommissions) {
				agentTotals.set(c.agentId, (agentTotals.get(c.agentId) ?? 0) + c.amount);
			}
			const sortedAgentEntries = [...agentTotals.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);

			let topAgents: Record<string, any>[] = [];
			if (sortedAgentEntries.length > 0) {
				const agentIds = sortedAgentEntries.map(([id]) => id);
				const agentDetails = await prisma.agent.findMany({
					where: { id: { in: agentIds } },
					include: { user: { select: { email: true, role: true, userName: true } } },
				});
				topAgents = sortedAgentEntries.map(([agentId, totalCommission], index) => {
					const agent = agentDetails.find((a) => a.id === agentId);
					const name = agent?.user?.userName ?? agent?.user?.email ?? "Unknown";
					return {
						rank: index + 1,
						name,
						role: agent?.role ?? "AGENT",
						collections: Math.round(totalCommission / (gameConfig?.cobradorRate ?? 0.15)),
						commission: Math.round(totalCommission),
						customers: 0,
						winRate: "N/A",
					};
				});
			}

			// ── Compliance Logs ─────────────────────────────────────────────────────
			const complianceLogs = complianceAlerts.map((log) => {
				const details = log.newValue as Record<string, any> | null;
				return {
					id: log.id,
					type: "Alert",
					event: `Suspicious ${details?.type ?? "Transaction"} — ${details?.reasons?.[0] ?? "Flagged"}`,
					user: log.user?.email ?? "System",
					timestamp: log.createdAt.toISOString(),
					severity: details?.severity ?? "MEDIUM",
					amount: details?.amount,
				};
			});

			// ── Format draw reports ─────────────────────────────────────────────────
			const drawReports = drawBreakdown.map((d) => ({
				id: d.id,
				draw: `${d.drawType === "MORNING" ? "11:00 AM" : d.drawType === "AFTERNOON" ? "4:00 PM" : "9:00 PM"} - ${new Date(d.drawDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
				bets: d.totalBets,
				stake: d.totalStake,
				payout: d.totalPayout,
				winners: 0,
				margin: d.totalStake > 0 ? `${Math.round(((d.totalStake - d.totalPayout) / d.totalStake) * 1000) / 10}%` : "0%",
			}));

			res.status(200).json(
				buildSuccessResponse("Reports retrieved", {
					bets: totalBets,
					revenue: grossRevenue,
					payouts: totalPayouts,
					net: netRevenue,
					govRate: Math.round(govRate * 100),
					profitMargin,
					govShare,
					avgBetAmount: totalBets > 0 ? Math.round(grossRevenue / totalBets) : 0,
					totalDeposits: depositAgg._sum.amount ?? 0,
					totalWithdrawals: withdrawalAgg._sum.amount ?? 0,
					totalUsers,
					totalCommissions: commissionAgg._sum.amount ?? 0,
					drawReports,
					regionalData: [],
					topAgents,
					complianceLogs,
				}, 200),
			);
		} catch (error) {
			reportsLogger.error(`getSummary error: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to retrieve reports", 500));
		}
	};

	// ─── GET /reports/export/pcso — Download PCSO government report as CSV ─────
	const exportPCSO = async (req: Request, res: Response) => {
		try {
			const { from, to } = req.query as { from?: string; to?: string };

			const drawDateFilter =
				from && to
					? { drawDate: { gte: new Date(from as string), lte: new Date(to as string) } }
					: {};
			const txDateFilter =
				from && to
					? { createdAt: { gte: new Date(from as string), lte: new Date(to as string) } }
					: {};

			const [drawBreakdown, depositAgg, withdrawalAgg, totalBets, alertCount] = await Promise.all([
				prisma.juetengDraw.findMany({
					where: { status: "SETTLED", ...drawDateFilter },
					select: {
						drawType: true,
						drawDate: true,
						totalBets: true,
						totalStake: true,
						totalPayout: true,
						grossProfit: true,
					},
					orderBy: { drawDate: "asc" },
				}),
				prisma.transaction.aggregate({
					_sum: { amount: true },
					where: { type: "DEPOSIT", status: "COMPLETED", ...txDateFilter },
				}),
				prisma.transaction.aggregate({
					_sum: { amount: true },
					where: { type: "WITHDRAWAL", status: "COMPLETED", ...txDateFilter },
				}),
				prisma.juetengBet.count({ where: txDateFilter }),
				prisma.auditLog.count({
					where: { action: "SUSPICIOUS_TRANSACTION_ALERT", ...txDateFilter },
				}),
			]);

			const gameConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
			const govRate = gameConfig?.governmentRate ?? 0.3;
			const grossRevenue = drawBreakdown.reduce((s, d) => s + d.totalStake, 0);
			const totalPayouts = drawBreakdown.reduce((s, d) => s + d.totalPayout, 0);
			const netRevenue = drawBreakdown.reduce((s, d) => s + d.grossProfit, 0);
			const govShare = Math.round(netRevenue * govRate);
			const periodLabel = from && to ? `${from} to ${to}` : "All time";

			const lines: string[] = [
				"JUETENGPH OPERATOR REPORT (PCSO FORMAT)",
				`Generated,${new Date().toISOString()}`,
				`Period,${periodLabel}`,
				"",
				"SUMMARY",
				`Total Bets,${totalBets}`,
				`Gross Revenue (PHP),${grossRevenue.toFixed(2)}`,
				`Total Payouts (PHP),${totalPayouts.toFixed(2)}`,
				`Net Revenue (PHP),${netRevenue.toFixed(2)}`,
				`Government Share (${Math.round(govRate * 100)}%) (PHP),${govShare.toFixed(2)}`,
				`Operator Retained (PHP),${(netRevenue - govShare).toFixed(2)}`,
				`Total Deposits (PHP),${(depositAgg._sum.amount ?? 0).toFixed(2)}`,
				`Total Withdrawals (PHP),${(withdrawalAgg._sum.amount ?? 0).toFixed(2)}`,
				`Suspicious Transaction Alerts,${alertCount}`,
				"",
				"DRAW BREAKDOWN",
				"Draw Date,Draw Type,Total Bets,Total Stake (PHP),Total Payout (PHP),Gross Profit (PHP),Gov Share (PHP)",
				...drawBreakdown.map((d) => {
					const dGovShare = Math.round(d.grossProfit * govRate);
					const drawLabel = d.drawType === "MORNING" ? "Morning (11AM)" : d.drawType === "AFTERNOON" ? "Afternoon (4PM)" : "Evening (9PM)";
					return `${new Date(d.drawDate).toISOString().split("T")[0]},${drawLabel},${d.totalBets},${d.totalStake.toFixed(2)},${d.totalPayout.toFixed(2)},${d.grossProfit.toFixed(2)},${dGovShare.toFixed(2)}`;
				}),
			];

			const csv = lines.join("\r\n");
			const filename = `pcso-report-${new Date().toISOString().split("T")[0]}.csv`;
			res.setHeader("Content-Type", "text/csv");
			res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
			res.status(200).send(csv);
		} catch (error) {
			reportsLogger.error(`exportPCSO error: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to generate PCSO report", 500));
		}
	};

	// ─── GET /reports/audit-logs — List local tamper-proof audit log entries ───
	const getAuditLogs = async (req: Request, res: Response) => {
		try {
			const { from, to, action } = req.query as { from?: string; to?: string; action?: string };
			const page = parseInt(req.query.page as string) || 1;
			const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
			const skip = (page - 1) * limit;

			const where: Record<string, any> = {};
			if (from && to) where.createdAt = { gte: new Date(from), lte: new Date(to) };
			if (action) where.action = action;

			const [logs, total] = await Promise.all([
				prisma.auditLog.findMany({
					where,
					orderBy: { createdAt: "desc" },
					skip,
					take: limit,
					include: { user: { select: { email: true, role: true } } },
				}),
				prisma.auditLog.count({ where }),
			]);

			const mapped = logs.map((log) => ({
				id: log.id,
				action: log.action,
				resource: log.resource,
				resourceId: log.resourceId,
				userId: log.userId,
				userEmail: log.user?.email ?? "System",
				userRole: log.user?.role ?? null,
				newValue: log.newValue,
				oldValue: log.oldValue,
				ipAddress: log.ipAddress,
				hasHash: !!log.hash,
				createdAt: log.createdAt,
			}));

			res.status(200).json(
				buildSuccessResponse("Audit logs retrieved", {
					logs: mapped,
					count: total,
					pagination: { page, limit, totalPages: Math.ceil(total / limit), total },
				}, 200),
			);
		} catch (error) {
			reportsLogger.error(`getAuditLogs error: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to retrieve audit logs", 500));
		}
	};

	// ─── GET /reports/audit/verify — Verify audit chain integrity ──────────────
	const verifyAudit = async (req: Request, res: Response) => {
		try {
			const result = await verifyAuditChain(prisma);
			const status = result.valid ? 200 : 409;
			res.status(status).json(
				buildSuccessResponse(
					result.valid
						? `Audit chain intact — ${result.totalChecked} entries verified`
						: `Chain integrity violation detected at entry ${result.brokenAt}`,
					result,
					status,
				),
			);
		} catch (error) {
			reportsLogger.error(`verifyAudit error: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to verify audit chain", 500));
		}
	};

	return { getSummary, exportPCSO, verifyAudit, getAuditLogs };
};
