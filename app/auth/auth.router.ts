import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import verifyToken from "../../middleware/verifyToken";

// Strict rate limiter for auth endpoints (prevents brute-force / credential stuffing)
const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // 10 attempts per window
	message: {
		status: "error",
		message: "Too many authentication attempts. Please try again later.",
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => req.ip || "unknown",
});

interface IAuthController {
	register(req: Request, res: Response, next: NextFunction): Promise<void>;
	login(req: Request, res: Response, next: NextFunction): Promise<void>;
	logout(req: Request, res: Response, next: NextFunction): Promise<void>;
	refresh(req: Request, res: Response, next: NextFunction): Promise<void>;
	changePassword(req: Request, res: Response, next: NextFunction): Promise<void>;
	me(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestOtp(req: Request, res: Response, next: NextFunction): Promise<void>;
	verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IAuthController): Router => {
	const routes = Router();
	const path = "/auth";

	/**
	 * @openapi
	 * /api/auth/register:
	 *   post:
	 *     summary: Register a new user
	 *     description: Create a new user account with Person, Wallet, and Session. Returns JWT access token in cookie.
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [email, password, firstName, lastName]
	 *             properties:
	 *               email:
	 *                 type: string
	 *                 format: email
	 *               password:
	 *                 type: string
	 *                 minLength: 6
	 *               firstName:
	 *                 type: string
	 *               lastName:
	 *                 type: string
	 *               middleName:
	 *                 type: string
	 *               phoneNumber:
	 *                 type: string
	 *               userName:
	 *                 type: string
	 *                 minLength: 3
	 *               role:
	 *                 type: string
	 *                 enum: [PLAYER, AGENT, ADMIN, SUPER_ADMIN]
	 *                 default: PLAYER
	 *               referralCode:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: User registered successfully
	 *       400:
	 *         description: Validation failed
	 *       409:
	 *         description: User already exists
	 *       500:
	 *         description: Internal server error
	 */
	routes.post(`${path}/register`, authRateLimiter, controller.register);

	/**
	 * @openapi
	 * /api/auth/login:
	 *   post:
	 *     summary: Login with email and password
	 *     description: Authenticate user and return JWT token in httpOnly cookie
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [email, password]
	 *             properties:
	 *               email:
	 *                 type: string
	 *                 format: email
	 *               password:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Login successful
	 *       401:
	 *         description: Invalid credentials
	 *       403:
	 *         description: Account suspended
	 *       500:
	 *         description: Internal server error
	 */
	routes.post(`${path}/login`, authRateLimiter, controller.login);

	/**
	 * @openapi
	 * /api/auth/logout:
	 *   post:
	 *     summary: Logout current user
	 *     description: Invalidate session and clear cookies
	 *     tags: [Auth]
	 *     responses:
	 *       200:
	 *         description: Logged out successfully
	 */
	routes.post(`${path}/logout`, controller.logout);

	/**
	 * @openapi
	 * /api/auth/refresh:
	 *   post:
	 *     summary: Refresh access token
	 *     description: Use refresh token cookie to get a new access token with token rotation
	 *     tags: [Auth]
	 *     responses:
	 *       200:
	 *         description: Token refreshed
	 *       401:
	 *         description: Invalid or expired refresh token
	 */
	routes.post(`${path}/refresh`, controller.refresh);

	/**
	 * @openapi
	 * /api/auth/change-password:
	 *   post:
	 *     summary: Change password
	 *     description: Change current user's password (requires authentication)
	 *     tags: [Auth]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [currentPassword, newPassword]
	 *             properties:
	 *               currentPassword:
	 *                 type: string
	 *               newPassword:
	 *                 type: string
	 *                 minLength: 6
	 *     responses:
	 *       200:
	 *         description: Password changed
	 *       401:
	 *         description: Invalid current password
	 */
	routes.post(`${path}/change-password`, verifyToken, controller.changePassword);

	/**
	 * @openapi
	 * /api/auth/me:
	 *   get:
	 *     summary: Get current user profile
	 *     description: Returns authenticated user's profile with person, wallet, KYC, and agent data
	 *     tags: [Auth]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: User profile retrieved
	 *       401:
	 *         description: Unauthorized
	 */
	routes.get(`${path}/me`, verifyToken, controller.me);

	/**
	 * @openapi
	 * /api/auth/otp/request:
	 *   post:
	 *     summary: Request OTP code
	 *     description: Send an OTP code via email or SMS for verification
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               email:
	 *                 type: string
	 *                 format: email
	 *               phone:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *                 enum: [REGISTRATION, LOGIN, PASSWORD_RESET, PHONE_VERIFICATION, EMAIL_VERIFICATION, WITHDRAWAL]
	 *     responses:
	 *       200:
	 *         description: OTP sent
	 *       400:
	 *         description: Email or phone required
	 */
	routes.post(`${path}/otp/request`, authRateLimiter, controller.requestOtp);

	/**
	 * @openapi
	 * /api/auth/otp/verify:
	 *   post:
	 *     summary: Verify OTP code
	 *     description: Verify an OTP code and update user verification status
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [code, type]
	 *             properties:
	 *               email:
	 *                 type: string
	 *                 format: email
	 *               phone:
	 *                 type: string
	 *               code:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *                 enum: [REGISTRATION, LOGIN, PASSWORD_RESET, PHONE_VERIFICATION, EMAIL_VERIFICATION, WITHDRAWAL]
	 *     responses:
	 *       200:
	 *         description: OTP verified
	 *       400:
	 *         description: Invalid or expired OTP
	 *       429:
	 *         description: Maximum attempts exceeded
	 */
	routes.post(`${path}/otp/verify`, authRateLimiter, controller.verifyOtp);

	route.use(routes);
	return route;
};
