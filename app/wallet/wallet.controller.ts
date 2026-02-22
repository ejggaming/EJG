import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateWalletSchema,
	UpdateWalletSchema,
	DepositRequestSchema,
	WithdrawRequestSchema,
} from "../../zod/wallet.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { notifyAdmins } from "../../utils/notifyAdmins";
import { notifyUser } from "../../utils/notifyUser";

const logger = getLogger();
const walletLogger = logger.child({ module: "wallet" });

const toSingleString = (v: unknown): string | undefined => {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
	return undefined;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			walletLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			walletLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateWalletSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			walletLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const wallet = await prisma.wallet.create({ data: validation.data });
			walletLogger.info(`Wallet created successfully: ${wallet.id}`);

			logActivity(req, {
				userId: (req as any).userId || "unknown",
				action: config.ACTIVITY_LOG.WALLET.ACTIONS.CREATE_WALLET,
				description: `${config.ACTIVITY_LOG.WALLET.DESCRIPTIONS.WALLET_CREATED}: ${wallet.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WALLET.PAGES.WALLET_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WALLET,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WALLET,
				entityId: wallet.id,
				changesBefore: null,
				changesAfter: {
					id: wallet.id,
					status: wallet.status,
					currency: wallet.currency,
					createdAt: wallet.createdAt,
					updatedAt: wallet.updatedAt,
				},
				description: `${config.AUDIT_LOG.WALLET.DESCRIPTIONS.WALLET_CREATED}: ${wallet.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info("Wallet list cache invalidated after creation");
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.CREATED,
				wallet,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, walletLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		walletLogger.info(
			`Getting wallets, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.WalletWhereInput = {};

			const searchFields = ["status", "currency"];
			if (query) {
				const searchConditions = buildSearchConditions("Wallet", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Wallet", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [wallets, total] = await Promise.all([
				document ? prisma.wallet.findMany(findManyQuery) : [],
				count ? prisma.wallet.count({ where: whereClause }) : 0,
			]);

			walletLogger.info(`Retrieved ${wallets.length} wallets`);
			const processedData =
				groupBy && document ? groupDataByField(wallets, groupBy as string) : wallets;

			const responseData: Record<string, any> = {
				...(document && { wallets: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.WALLET.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const fields = toSingleString(req.query.fields);

		try {
			if (!id) {
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:wallet:byId:${id}:${fields || "full"}`;
			let wallet = null;

			try {
				if (redisClient.isClientConnected()) {
					wallet = await redisClient.getJSON(cacheKey);
					if (wallet) {
						walletLogger.info(`Wallet ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				walletLogger.warn(`Redis cache retrieval failed for wallet ${id}:`, cacheError);
			}

			if (!wallet) {
				const query: Prisma.WalletFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				wallet = await prisma.wallet.findFirst(query);

				if (wallet && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, wallet, 3600);
						walletLogger.info(`Wallet ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						walletLogger.warn(
							`Failed to store wallet ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!wallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.RETRIEVED}: ${(wallet as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.RETRIEVED,
				wallet,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateWalletSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				walletLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				walletLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			walletLogger.info(`Updating wallet: ${id}`);

			const existingWallet = await prisma.wallet.findFirst({
				where: { id },
			});

			if (!existingWallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedWallet = await prisma.wallet.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:wallet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info(`Cache invalidated after wallet ${id} update`);
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet update:", cacheError);
			}

			walletLogger.info(`${config.SUCCESS.WALLET.UPDATED}: ${updatedWallet.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.UPDATED,
				{ wallet: updatedWallet },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.DELETED}: ${id}`);

			const existingWallet = await prisma.wallet.findFirst({
				where: { id },
			});

			if (!existingWallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.wallet.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:wallet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info(`Cache invalidated after wallet ${id} deletion`);
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet deletion:", cacheError);
			}

			walletLogger.info(`${config.SUCCESS.WALLET.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.WALLET.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// ─── GET /wallet/me — Get current user's wallet ──────────────────────────
	const getMyWallet = async (req: Request, res: Response, _next: NextFunction) => {
		const userId: string | undefined = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		try {
			const wallet = await prisma.wallet.findUnique({
				where: { userId },
				include: {
					transactions: {
						orderBy: { createdAt: "desc" },
						take: 20,
					},
				},
			});

			if (!wallet) {
				res.status(404).json(buildErrorResponse("Wallet not found", 404));
				return;
			}

			// Compute summary stats from transactions
			const allTx = await prisma.transaction.findMany({ where: { userId } });
			const totalDeposits = allTx
				.filter((t) => t.type === "DEPOSIT" && t.status === "COMPLETED")
				.reduce((sum, t) => sum + t.amount, 0);
			const totalWithdrawals = allTx
				.filter((t) => t.type === "WITHDRAWAL" && t.status === "COMPLETED")
				.reduce((sum, t) => sum + t.amount, 0);
			const totalWinnings = allTx
				.filter((t) => t.type === "JUETENG_PAYOUT" && t.status === "COMPLETED")
				.reduce((sum, t) => sum + t.amount, 0);

			res.status(200).json(
				buildSuccessResponse(
					"Wallet retrieved",
					{
						wallet,
						stats: { totalDeposits, totalWithdrawals, totalWinnings },
					},
					200,
				),
			);
		} catch (error) {
			walletLogger.error(`Error getting user wallet: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── GET /wallet/transactions — Get current user's transactions ──────────
	const getMyTransactions = async (req: Request, res: Response, _next: NextFunction) => {
		const userId: string | undefined = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 20;
		const type = req.query.type as string | undefined;
		const skip = (page - 1) * limit;

		try {
			const where: Prisma.TransactionWhereInput = { userId };
			if (type) {
				where.type = type as any;
			}

			const [transactions, total] = await Promise.all([
				prisma.transaction.findMany({
					where,
					orderBy: { createdAt: "desc" },
					skip,
					take: limit,
				}),
				prisma.transaction.count({ where }),
			]);

			res.status(200).json(
				buildSuccessResponse(
					"Transactions retrieved",
					{
						transactions,
						count: total,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			walletLogger.error(`Error getting transactions: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── POST /wallet/deposit — Request a deposit ────────────────────────────
	const requestDeposit = async (req: Request, res: Response, _next: NextFunction) => {
		const userId: string | undefined = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		const validation = DepositRequestSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const wallet = await prisma.wallet.findUnique({ where: { userId } });
			if (!wallet) {
				res.status(404).json(buildErrorResponse("Wallet not found. Contact support.", 404));
				return;
			}
			if (wallet.status !== "ACTIVE") {
				res.status(403).json(buildErrorResponse("Wallet is not active", 403));
				return;
			}

			const reference = `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

			const transaction = await prisma.transaction.create({
				data: {
					userId,
					walletId: wallet.id,
					type: "DEPOSIT",
					amount: validation.data.amount,
					balanceBefore: wallet.balance,
					balanceAfter: wallet.balance, // unchanged until approved
					currency: wallet.currency,
					status: "PENDING",
					reference: validation.data.referenceNumber || reference,
					description: `Deposit via ${validation.data.paymentMethod}`,
					metadata: {
						paymentMethod: validation.data.paymentMethod,
					},
				},
			});

			walletLogger.info(`Deposit request created: ${transaction.id} for user ${userId}`);

			// Notify all admin users about new deposit request
			await notifyAdmins(prisma, (req as any).io, {
				type: "TRANSACTION",
				title: "New Deposit Request",
				body: `Deposit request of ₱${transaction.amount.toLocaleString()} via ${validation.data.paymentMethod}.`,
				metadata: {
					transactionId: transaction.id,
					userId,
					amount: transaction.amount,
					paymentMethod: validation.data.paymentMethod,
					type: "DEPOSIT",
				},
			});

			logActivity(req, {
				userId,
				action: "DEPOSIT_REQUEST",
				description: `Deposit request of ${validation.data.amount} ${wallet.currency} via ${validation.data.paymentMethod}`,
				page: { url: req.originalUrl, title: "Wallet Deposit" },
			});

			res.status(201).json(
				buildSuccessResponse("Deposit request submitted", { transaction }, 201),
			);
		} catch (error) {
			walletLogger.error(`Deposit request failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── POST /wallet/withdraw — Request a withdrawal ────────────────────────
	const requestWithdraw = async (req: Request, res: Response, _next: NextFunction) => {
		const userId: string | undefined = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		const validation = WithdrawRequestSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const wallet = await prisma.wallet.findUnique({ where: { userId } });
			if (!wallet) {
				res.status(404).json(buildErrorResponse("Wallet not found", 404));
				return;
			}
			if (wallet.status !== "ACTIVE") {
				res.status(403).json(buildErrorResponse("Wallet is not active", 403));
				return;
			}
			if (wallet.balance < validation.data.amount) {
				res.status(400).json(buildErrorResponse("Insufficient balance", 400));
				return;
			}

			const reference = `WDR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

			const transaction = await prisma.transaction.create({
				data: {
					userId,
					walletId: wallet.id,
					type: "WITHDRAWAL",
					amount: validation.data.amount,
					balanceBefore: wallet.balance,
					balanceAfter: wallet.balance, // unchanged until approved
					currency: wallet.currency,
					status: "PENDING",
					reference,
					description: `Withdrawal to ${validation.data.paymentMethod} (${validation.data.accountNumber})`,
					metadata: {
						paymentMethod: validation.data.paymentMethod,
						accountNumber: validation.data.accountNumber,
						accountName: validation.data.accountName,
					},
				},
			});

			walletLogger.info(`Withdrawal request created: ${transaction.id} for user ${userId}`);

			// Notify all admin users about new withdrawal request
			await notifyAdmins(prisma, (req as any).io, {
				type: "TRANSACTION",
				title: "New Withdrawal Request",
				body: `Withdrawal request of ₱${transaction.amount.toLocaleString()} to ${validation.data.paymentMethod}.`,
				metadata: {
					transactionId: transaction.id,
					userId,
					amount: transaction.amount,
					paymentMethod: validation.data.paymentMethod,
					type: "WITHDRAWAL",
				},
			});

			logActivity(req, {
				userId,
				action: "WITHDRAWAL_REQUEST",
				description: `Withdrawal request of ${validation.data.amount} ${wallet.currency} to ${validation.data.paymentMethod}`,
				page: { url: req.originalUrl, title: "Wallet Withdrawal" },
			});

			res.status(201).json(
				buildSuccessResponse("Withdrawal request submitted", { transaction }, 201),
			);
		} catch (error) {
			walletLogger.error(`Withdrawal request failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── PATCH /wallet/transaction/:id/approve — Admin approves ──────────────
	const approveTransaction = async (req: Request, res: Response, _next: NextFunction) => {
		const txId = toSingleString(req.params.id) || "";
		const adminId: string = (req as any).user?.id || "unknown";

		try {
			const transaction = await prisma.transaction.findUnique({ where: { id: txId } });
			if (!transaction) {
				res.status(404).json(buildErrorResponse("Transaction not found", 404));
				return;
			}
			if (transaction.status !== "PENDING") {
				res.status(400).json(buildErrorResponse("Transaction is not pending", 400));
				return;
			}

			const wallet = await prisma.wallet.findUnique({ where: { id: transaction.walletId } });
			if (!wallet) {
				res.status(404).json(buildErrorResponse("Wallet not found", 404));
				return;
			}

			let newBalance = wallet.balance;
			if (transaction.type === "DEPOSIT") {
				newBalance = wallet.balance + transaction.amount;
			} else if (transaction.type === "WITHDRAWAL") {
				if (wallet.balance < transaction.amount) {
					res.status(400).json(
						buildErrorResponse("Insufficient balance for withdrawal", 400),
					);
					return;
				}
				newBalance = wallet.balance - transaction.amount;
			}

			// Atomic update: wallet balance + transaction status
			const [updatedWallet, updatedTx] = await prisma.$transaction([
				prisma.wallet.update({
					where: { id: wallet.id },
					data: { balance: newBalance },
				}),
				prisma.transaction.update({
					where: { id: txId },
					data: {
						status: "COMPLETED",
						balanceAfter: newBalance,
					},
				}),
			]);

			try {
				await invalidateCache.byPattern(`cache:wallet:byId:${wallet.id}:*`);
				await invalidateCache.byPattern("cache:wallet:list:*");
			} catch (_) {}

			walletLogger.info(
				`Transaction ${txId} approved by admin ${adminId}. New balance: ${newBalance}`,
			);

			logAudit(req, {
				userId: adminId,
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.WALLET,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM as
					| "LOW"
					| "MEDIUM"
					| "HIGH"
					| "CRITICAL",
				entityType: "TRANSACTION",
				entityId: txId,
				changesBefore: { status: "PENDING", balance: wallet.balance },
				changesAfter: { status: "COMPLETED", balance: newBalance },
				description: `Approved ${transaction.type} of ${transaction.amount} ${wallet.currency}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Transaction approved",
					{ transaction: updatedTx, wallet: updatedWallet },
					200,
				),
			);

			// Notify the user about the approved transaction (fire-and-forget)
			notifyUser(prisma, (req as any).io, transaction.userId, {
				type: "TRANSACTION",
				title: `${transaction.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} Approved`,
				body: `Your ${transaction.type.toLowerCase()} of \u20b1${transaction.amount.toLocaleString()} has been approved. New balance: \u20b1${newBalance.toLocaleString()}.`,
				metadata: {
					transactionId: txId,
					type: transaction.type,
					amount: transaction.amount,
					status: "COMPLETED",
					newBalance,
				},
			});
		} catch (error) {
			walletLogger.error(`Transaction approval failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── PATCH /wallet/transaction/:id/reject — Admin rejects ────────────────
	const rejectTransaction = async (req: Request, res: Response, _next: NextFunction) => {
		const txId = toSingleString(req.params.id) || "";
		const adminId: string = (req as any).userId || "unknown";
		const { reason } = req.body;

		try {
			const transaction = await prisma.transaction.findUnique({ where: { id: txId } });
			if (!transaction) {
				res.status(404).json(buildErrorResponse("Transaction not found", 404));
				return;
			}
			if (transaction.status !== "PENDING") {
				res.status(400).json(buildErrorResponse("Transaction is not pending", 400));
				return;
			}

			const updatedTx = await prisma.transaction.update({
				where: { id: txId },
				data: {
					status: "FAILED",
					description: reason
						? `${transaction.description} — Rejected: ${reason}`
						: transaction.description,
				},
			});

			walletLogger.info(`Transaction ${txId} rejected by admin ${adminId}`);

			res.status(200).json(
				buildSuccessResponse("Transaction rejected", { transaction: updatedTx }, 200),
			);

			// Notify the user about the rejected transaction (fire-and-forget)
			notifyUser(prisma, (req as any).io, transaction.userId, {
				type: "TRANSACTION",
				title: `${transaction.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} Rejected`,
				body: `Your ${transaction.type.toLowerCase()} of \u20b1${transaction.amount.toLocaleString()} has been rejected.${reason ? ` Reason: ${reason}` : ""}`,
				metadata: {
					transactionId: txId,
					type: transaction.type,
					amount: transaction.amount,
					status: "FAILED",
					reason: reason || undefined,
				},
			});
		} catch (error) {
			walletLogger.error(`Transaction rejection failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	// ─── GET /wallet/admin/transactions — Admin: list all transactions ───────
	const adminGetAllTransactions = async (req: Request, res: Response, _next: NextFunction) => {
		const role = (req as any).role;
		if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
			res.status(403).json(buildErrorResponse("Forbidden", 403));
			return;
		}

		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 50;
		const skip = (page - 1) * limit;
		const type = req.query.type as string | undefined;
		const status = req.query.status as string | undefined;

		try {
			const where: Prisma.TransactionWhereInput = {};
			if (type) where.type = type as any;
			if (status) where.status = status as any;

			const [transactions, total] = await Promise.all([
				prisma.transaction.findMany({
					where,
					orderBy: { createdAt: "desc" },
					skip,
					take: limit,
					include: {
						user: {
							include: { person: true },
						},
					},
				}),
				prisma.transaction.count({ where }),
			]);

			const mapped = transactions.map((tx) => ({
				...tx,
				userName:
					tx.user?.person?.personalInfo?.firstName &&
					tx.user?.person?.personalInfo?.lastName
						? `${tx.user.person.personalInfo.firstName} ${tx.user.person.personalInfo.lastName}`
						: (tx.user?.email ?? "Unknown"),
				userEmail: tx.user?.email ?? "",
				user: undefined,
			}));

			const totalPages = Math.ceil(total / limit);

			res.status(200).json(
				buildSuccessResponse("Transactions retrieved", {
					transactions: mapped,
					count: total,
					pagination: { page, limit, totalPages, total },
				}),
			);
		} catch (error) {
			walletLogger.error(`Admin getAllTransactions error: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
		getMyWallet,
		getMyTransactions,
		requestDeposit,
		requestWithdraw,
		approveTransaction,
		rejectTransaction,
		adminGetAllTransactions,
	};
};
