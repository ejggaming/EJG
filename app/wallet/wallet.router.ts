import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMyWallet(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMyTransactions(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestDeposit(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestWithdraw(req: Request, res: Response, next: NextFunction): Promise<void>;
	approveTransaction(req: Request, res: Response, next: NextFunction): Promise<void>;
	rejectTransaction(req: Request, res: Response, next: NextFunction): Promise<void>;
	adminGetAllTransactions(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/wallet";

	// ─── Player Wallet Endpoints (must be before /:id) ────────────────────────

	/**
	 * @openapi
	 * /api/wallet/me:
	 *   get:
	 *     summary: Get current user's wallet
	 *     description: Returns the authenticated user's wallet with balance, recent transactions, and summary stats
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Wallet retrieved successfully
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 */
	routes.get("/me", controller.getMyWallet);

	/**
	 * @openapi
	 * /api/wallet/transactions:
	 *   get:
	 *     summary: Get current user's transactions
	 *     description: Paginated transaction history for the authenticated user
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *       - in: query
	 *         name: type
	 *         schema:
	 *           type: string
	 *           enum: [DEPOSIT, WITHDRAWAL, JUETENG_BET, JUETENG_PAYOUT, COMMISSION_PAYOUT, ADJUSTMENT]
	 *     responses:
	 *       200:
	 *         description: Transactions retrieved successfully
	 */
	routes.get("/transactions", controller.getMyTransactions);

	/**
	 * @openapi
	 * /api/wallet/deposit:
	 *   post:
	 *     summary: Request a deposit
	 *     description: Create a pending deposit request for admin approval
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [amount, paymentMethod]
	 *             properties:
	 *               amount:
	 *                 type: number
	 *                 minimum: 50
	 *                 maximum: 50000
	 *               paymentMethod:
	 *                 type: string
	 *               referenceNumber:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Deposit request created
	 */
	routes.post("/deposit", controller.requestDeposit);

	/**
	 * @openapi
	 * /api/wallet/withdraw:
	 *   post:
	 *     summary: Request a withdrawal
	 *     description: Create a pending withdrawal request for admin approval
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [amount, paymentMethod, accountNumber, accountName]
	 *             properties:
	 *               amount:
	 *                 type: number
	 *                 minimum: 100
	 *               paymentMethod:
	 *                 type: string
	 *               accountNumber:
	 *                 type: string
	 *               accountName:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Withdrawal request created
	 */
	routes.post("/withdraw", controller.requestWithdraw);

	/**
	 * @openapi
	 * /api/wallet/transaction/{id}/approve:
	 *   patch:
	 *     summary: Approve a pending transaction
	 *     description: Admin approves a deposit or withdrawal — updates wallet balance
	 *     tags: [Wallet]
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
	 *         description: Transaction approved
	 */
	routes.patch("/transaction/:id/approve", controller.approveTransaction);

	/**
	 * @openapi
	 * /api/wallet/transaction/{id}/reject:
	 *   patch:
	 *     summary: Reject a pending transaction
	 *     description: Admin rejects a deposit or withdrawal request
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               reason:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Transaction rejected
	 */
	routes.patch("/transaction/:id/reject", controller.rejectTransaction);

	/**
	 * @openapi
	 * /api/wallet/admin/transactions:
	 *   get:
	 *     summary: Get all transactions (Admin)
	 *     description: Admin endpoint to list all platform transactions with filtering and pagination
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *       - in: query
	 *         name: type
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Transactions retrieved
	 *       403:
	 *         description: Forbidden
	 */
	routes.get("/admin/transactions", controller.adminGetAllTransactions);

	// ─── Generic CRUD Endpoints ───────────────────────────────────────────────

	/**
	 * @openapi
	 * /api/wallet/{id}:
	 *   get:
	 *     summary: Get wallet by ID
	 *     description: Retrieve a specific wallet by its unique identifier with optional field selection
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Wallet ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: Wallet retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         wallet:
	 *                           $ref: '#/components/schemas/Wallet'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual wallet with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:wallet:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/wallet:
	 *   get:
	 *     summary: Get all wallets
	 *     description: Retrieve wallets with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include wallet documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Templates retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         wallets:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Wallet'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Wallet'
	 *                           description: Present when groupBy is used and document="true"
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache wallet list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:wallet:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/wallet:
	 *   post:
	 *     summary: Create new wallet
	 *     description: Create a new wallet with the provided data
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Wallet name
	 *                 example: "Email Welcome Wallet"
	 *               description:
	 *                 type: string
	 *                 description: Wallet description
	 *                 example: "Welcome email wallet for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Wallet type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: Wallet created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         wallet:
	 *                           $ref: '#/components/schemas/Wallet'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/wallet/{id}:
	 *   patch:
	 *     summary: Update wallet
	 *     description: Update wallet data by ID (partial update)
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Wallet ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Wallet name
	 *                 example: "Updated Email Wallet"
	 *               description:
	 *                 type: string
	 *                 description: Wallet description
	 *                 example: "Updated description for the wallet"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Wallet type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: Wallet updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         wallet:
	 *                           $ref: '#/components/schemas/Wallet'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/wallet/{id}:
	 *   delete:
	 *     summary: Delete wallet
	 *     description: Permanently delete a wallet by ID
	 *     tags: [Wallet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Wallet ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Wallet deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
