import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import fs from "fs";
import { config } from "../config/config";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const emailLogger = logger.child({ module: "email" });

// ── Transporter (Gmail App Password) ──
const transporter = nodemailer.createTransport({
	host: config.email.host,
	port: config.email.port,
	secure: config.email.secure, // false for 587, true for 465
	auth: {
		user: config.email.user,
		pass: config.email.appPassword,
	},
});

// Verify connection on startup
transporter
	.verify()
	.then(() => {
		emailLogger.info("SMTP email transporter is ready");
	})
	.catch((err) => {
		emailLogger.error(`SMTP connection failed: ${err.message}`);
	});

// ── Template directory ──
const TEMPLATE_DIR = path.join(__dirname, "..", "views", "emails");

/**
 * Render an EJS template to HTML
 */
const renderTemplate = async (templateName: string, data: Record<string, any>): Promise<string> => {
	const templatePath = path.join(TEMPLATE_DIR, `${templateName}.ejs`);

	if (!fs.existsSync(templatePath)) {
		throw new Error(`Email template not found: ${templatePath}`);
	}

	return ejs.renderFile(templatePath, data);
};

// ── Public API ──

export interface SendEmailOptions {
	to: string;
	subject: string;
	template: string;
	data: Record<string, any>;
}

/**
 * Send an email using an EJS template
 */
export const sendEmail = async (options: SendEmailOptions): Promise<boolean> => {
	try {
		const html = await renderTemplate(options.template, options.data);

		const info = await transporter.sendMail({
			from: `"Jueteng Platform" <${config.email.from}>`,
			to: options.to,
			subject: options.subject,
			html,
		});

		emailLogger.info(`Email sent to ${options.to} — messageId: ${info.messageId}`);
		return true;
	} catch (error: any) {
		emailLogger.error(`Failed to send email to ${options.to}: ${error.message}`);
		return false;
	}
};

/**
 * Send OTP verification email
 */
export const sendOtpEmail = async (
	to: string,
	code: string,
	type: string,
	expiryMinutes: number,
): Promise<boolean> => {
	const typeLabels: Record<string, string> = {
		REGISTRATION: "Registration Verification",
		LOGIN: "Login Verification",
		PASSWORD_RESET: "Password Reset",
		EMAIL_VERIFICATION: "Email Verification",
		WITHDRAWAL: "Withdrawal Confirmation",
	};

	const subject = `${typeLabels[type] || "Verification"} — Your OTP Code`;

	return sendEmail({
		to,
		subject,
		template: "otp",
		data: {
			code,
			type,
			typeLabel: typeLabels[type] || "Verification",
			expiryMinutes,
			year: new Date().getFullYear(),
		},
	});
};

/**
 * Send welcome email after registration
 */
export const sendWelcomeEmail = async (to: string, firstName: string): Promise<boolean> => {
	return sendEmail({
		to,
		subject: "Welcome to Jueteng Platform!",
		template: "welcome",
		data: {
			firstName,
			year: new Date().getFullYear(),
		},
	});
};
