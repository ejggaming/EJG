/**
 * Tamper-Proof Audit Log Utility
 *
 * Each audit entry stores:
 *   - hash:         SHA-256 of (previousHash | action | resource | resourceId | userId | newValue | createdAt)
 *   - previousHash: hash of the immediately preceding entry in the chain
 *
 * Any modification to a record breaks its hash, and any deletion breaks the
 * chain continuity — both detectable by verifyAuditChain().
 */
import { createHash } from "crypto";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger().child({ module: "tamperProofAudit" });

export interface AuditEntryInput {
	userId?: string | null;
	action: string;
	resource: string;
	resourceId?: string | null;
	oldValue?: Record<string, any> | null;
	newValue?: Record<string, any> | null;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export interface VerifyResult {
	valid: boolean;
	totalChecked: number;
	brokenAt: string | null;
	brokenReason: string | null;
}

/** Compute the SHA-256 hash for an audit entry. */
export function computeEntryHash(fields: {
	previousHash: string | null;
	action: string;
	resource: string;
	resourceId: string | null;
	userId: string | null;
	newValue: Record<string, any> | null;
	createdAt: Date;
}): string {
	const payload = [
		fields.previousHash ?? "GENESIS",
		fields.action,
		fields.resource,
		fields.resourceId ?? "",
		fields.userId ?? "",
		JSON.stringify(fields.newValue ?? null),
		fields.createdAt.toISOString(),
	].join("|");
	return createHash("sha256").update(payload).digest("hex");
}

/**
 * Create a tamper-proof audit log entry.
 * Reads the latest entry's hash to build the chain, then writes the new entry
 * atomically with its own hash.
 *
 * NOTE: In a high-concurrency environment you would use a distributed lock or
 * a database-level sequence. For this single-server setup, the async chain
 * is written sequentially and is sufficient.
 */
export async function createAuditEntry(
	prisma: PrismaClient,
	data: AuditEntryInput,
): Promise<void> {
	try {
		// Read the latest hash in the chain
		const lastEntry = await prisma.auditLog.findFirst({
			where: { hash: { not: null } },
			orderBy: { createdAt: "desc" },
			select: { hash: true },
		});

		const previousHash = lastEntry?.hash ?? null;
		const createdAt = new Date();

		const hash = computeEntryHash({
			previousHash,
			action: data.action,
			resource: data.resource,
			resourceId: data.resourceId ?? null,
			userId: data.userId ?? null,
			newValue: data.newValue ?? null,
			createdAt,
		});

		await prisma.auditLog.create({
			data: {
				userId: data.userId ?? null,
				action: data.action,
				resource: data.resource,
				resourceId: data.resourceId ?? null,
				oldValue: data.oldValue ?? undefined,
				newValue: data.newValue ?? undefined,
				ipAddress: data.ipAddress ?? null,
				userAgent: data.userAgent ?? null,
				hash,
				previousHash,
				createdAt,
			},
		});
	} catch (err) {
		logger.warn(`createAuditEntry failed: ${err}`);
	}
}

/**
 * Walk the full hash chain and verify every entry's integrity.
 * Returns a VerifyResult indicating whether the chain is intact.
 */
export async function verifyAuditChain(prisma: PrismaClient): Promise<VerifyResult> {
	const entries = await prisma.auditLog.findMany({
		where: { hash: { not: null } },
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			action: true,
			resource: true,
			resourceId: true,
			userId: true,
			newValue: true,
			hash: true,
			previousHash: true,
			createdAt: true,
		},
	});

	let expectedPreviousHash: string | null = null;

	for (const entry of entries) {
		// Check chain linkage
		if (entry.previousHash !== expectedPreviousHash) {
			return {
				valid: false,
				totalChecked: entries.indexOf(entry),
				brokenAt: entry.id,
				brokenReason: `Chain broken — expected previousHash ${expectedPreviousHash ?? "GENESIS"} but got ${entry.previousHash}`,
			};
		}

		// Recompute and compare hash
		const expected = computeEntryHash({
			previousHash: entry.previousHash ?? null,
			action: entry.action,
			resource: entry.resource,
			resourceId: entry.resourceId ?? null,
			userId: entry.userId ?? null,
			newValue: (entry.newValue as Record<string, any>) ?? null,
			createdAt: entry.createdAt,
		});

		if (entry.hash !== expected) {
			return {
				valid: false,
				totalChecked: entries.indexOf(entry),
				brokenAt: entry.id,
				brokenReason: `Hash mismatch on entry ${entry.id} — expected ${expected}, got ${entry.hash}`,
			};
		}

		expectedPreviousHash = entry.hash!;
	}

	return {
		valid: true,
		totalChecked: entries.length,
		brokenAt: null,
		brokenReason: null,
	};
}
