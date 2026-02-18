import express, { Router } from "express";
import { controller } from "./kyc.controller";
import { router } from "./kyc.router";
import { PrismaClient } from "../../generated/prisma";

export const kycModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = kycModule;
