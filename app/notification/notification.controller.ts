import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateNotificationSchema, UpdateNotificationSchema } from "../../zod/notification.zod";
import { config } from "../../config/constant";

const logger = getLogger();
const notificationLogger = logger.child({ module: "notification" });

const toSingleString = (v: unknown): string | undefined => {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
	return undefined;
};

export const controller = (prisma: PrismaClient) => {
	// ── CREATE ──
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreateNotificationSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const notification = await prisma.notification.create({ data: validation.data });
			notificationLogger.info(`Notification created: ${notification.id}`);

			// Emit real-time notification via Socket.io
			const io = (req as any).io;
			if (io) {
				io.to(validation.data.userId).emit("notification", notification);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION?.CREATED || "Notification created successfully",
				notification,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Create error: ${error}`);
			const errorResponse = buildErrorResponse("Error creating notification", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── GET ALL (user's notifications) ──
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, notificationLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const { page, limit, order, sort, skip, query, document, pagination, count, filter } =
			validationResult.validatedParams!;

		const userId = (req as any).userId;

		try {
			const whereClause: Prisma.NotificationWhereInput = {};
			if (userId) {
				whereClause.userId = userId;
			}

			const searchFields = ["title", "body"];
			if (query) {
				const searchConditions = buildSearchConditions("Notification", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Notification", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort);

			const [notifications, total] = await Promise.all([
				document ? prisma.notification.findMany(findManyQuery) : [],
				count ? prisma.notification.count({ where: whereClause }) : 0,
			]);

			const responseData: Record<string, any> = {
				...(document && { notifications }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.NOTIFICATION?.RETRIEVED_ALL ||
						"Notifications retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			notificationLogger.error(`Get all error: ${error}`);
			const errorResponse = buildErrorResponse("Error getting notifications", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── GET BY ID ──
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			const errorResponse = buildErrorResponse("Invalid notification ID format", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const notification = await prisma.notification.findUnique({ where: { id } });
			if (!notification) {
				const errorResponse = buildErrorResponse("Notification not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Ownership check: users can only access their own notifications
			if (userId && notification.userId !== userId) {
				const errorResponse = buildErrorResponse("Forbidden: not your notification", 403);
				res.status(403).json(errorResponse);
				return;
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION?.RETRIEVED || "Notification retrieved successfully",
				notification,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Get by ID error: ${error}`);
			const errorResponse = buildErrorResponse("Error getting notification", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── MARK AS READ ──
	const markAsRead = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			const errorResponse = buildErrorResponse("Invalid notification ID format", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Check ownership
			const existing = await prisma.notification.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Notification not found", 404));
				return;
			}
			if (userId && existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden: not your notification", 403));
				return;
			}

			const notification = await prisma.notification.update({
				where: { id },
				data: { status: "READ", readAt: new Date() },
			});

			const successResponse = buildSuccessResponse(
				"Notification marked as read",
				notification,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Mark as read error: ${error}`);
			const errorResponse = buildErrorResponse("Error updating notification", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── MARK ALL AS READ ──
	const markAllAsRead = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).userId;

		if (!userId) {
			const errorResponse = buildErrorResponse("Unauthorized", 401);
			res.status(401).json(errorResponse);
			return;
		}

		try {
			const result = await prisma.notification.updateMany({
				where: { userId, status: { not: "READ" } },
				data: { status: "READ", readAt: new Date() },
			});

			const successResponse = buildSuccessResponse("All notifications marked as read", {
				count: result.count,
			});
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Mark all as read error: ${error}`);
			const errorResponse = buildErrorResponse("Error updating notifications", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── GET UNREAD COUNT ──
	const getUnreadCount = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).userId;

		if (!userId) {
			const errorResponse = buildErrorResponse("Unauthorized", 401);
			res.status(401).json(errorResponse);
			return;
		}

		try {
			const unreadCount = await prisma.notification.count({
				where: { userId, status: { not: "READ" } },
			});

			const successResponse = buildSuccessResponse("Unread count retrieved", { unreadCount });
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Unread count error: ${error}`);
			const errorResponse = buildErrorResponse("Error getting unread count", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── DELETE ──
	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			const errorResponse = buildErrorResponse("Invalid notification ID format", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Check ownership
			const existing = await prisma.notification.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Notification not found", 404));
				return;
			}
			if (userId && existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden: not your notification", 403));
				return;
			}

			await prisma.notification.delete({ where: { id } });
			const successResponse = buildSuccessResponse("Notification deleted successfully", null);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Delete error: ${error}`);
			const errorResponse = buildErrorResponse("Error deleting notification", 500);
			res.status(500).json(errorResponse);
		}
	};

	// ── UPDATE ──
	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			const errorResponse = buildErrorResponse("Invalid notification ID format", 400);
			res.status(400).json(errorResponse);
			return;
		}

		const validation = UpdateNotificationSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Check ownership
			const existing = await prisma.notification.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Notification not found", 404));
				return;
			}
			if (userId && existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden: not your notification", 403));
				return;
			}

			const notification = await prisma.notification.update({
				where: { id },
				data: validation.data,
			});

			const successResponse = buildSuccessResponse(
				"Notification updated successfully",
				notification,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Update error: ${error}`);
			const errorResponse = buildErrorResponse("Error updating notification", 500);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, markAsRead, markAllAsRead, getUnreadCount, remove, update };
};
