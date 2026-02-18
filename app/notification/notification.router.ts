import { Router, Request, Response, NextFunction } from "express";

interface INotificationController {
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	markAsRead(req: Request, res: Response, next: NextFunction): Promise<void>;
	markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void>;
	getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: INotificationController): Router => {
	const routes = Router();
	const path = "/notification";

	/**
	 * @openapi
	 * /api/notification:
	 *   get:
	 *     summary: Get all notifications for current user
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 20
	 *       - in: query
	 *         name: sort
	 *         schema:
	 *           type: string
	 *           default: createdAt
	 *       - in: query
	 *         name: order
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *     responses:
	 *       200:
	 *         description: Notifications retrieved
	 */
	routes.get(`${path}`, controller.getAll);

	/**
	 * @openapi
	 * /api/notification/unread-count:
	 *   get:
	 *     summary: Get unread notification count
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Unread count returned
	 */
	routes.get(`${path}/unread-count`, controller.getUnreadCount);

	/**
	 * @openapi
	 * /api/notification/{id}:
	 *   get:
	 *     summary: Get notification by ID
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Notification retrieved
	 */
	routes.get(`${path}/:id`, controller.getById);

	/**
	 * @openapi
	 * /api/notification:
	 *   post:
	 *     summary: Create a notification
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [userId, type, title, body]
	 *             properties:
	 *               userId:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *                 enum: [SYSTEM, TRANSACTION, KYC_UPDATE, DRAW_RESULT, PAYOUT, SECURITY, COMMISSION]
	 *               title:
	 *                 type: string
	 *               body:
	 *                 type: string
	 *               channel:
	 *                 type: string
	 *                 enum: [IN_APP, SMS, EMAIL, PUSH]
	 *                 default: IN_APP
	 *               metadata:
	 *                 type: object
	 *     responses:
	 *       201:
	 *         description: Notification created
	 */
	routes.post(`${path}`, controller.create);

	/**
	 * @openapi
	 * /api/notification/{id}:
	 *   put:
	 *     summary: Update a notification
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Notification updated
	 */
	routes.put(`${path}/:id`, controller.update);

	/**
	 * @openapi
	 * /api/notification/{id}/read:
	 *   patch:
	 *     summary: Mark notification as read
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Notification marked as read
	 */
	routes.patch(`${path}/:id/read`, controller.markAsRead);

	/**
	 * @openapi
	 * /api/notification/read-all:
	 *   patch:
	 *     summary: Mark all notifications as read
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: All notifications marked as read
	 */
	routes.patch(`${path}/read-all`, controller.markAllAsRead);

	/**
	 * @openapi
	 * /api/notification/{id}:
	 *   delete:
	 *     summary: Delete a notification
	 *     tags: [Notification]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Notification deleted
	 */
	routes.delete(`${path}/:id`, controller.remove);

	route.use(routes);
	return route;
};
