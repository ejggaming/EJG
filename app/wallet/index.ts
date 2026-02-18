import express, { Router } from "express";
import { controller } from "./wallet.controller";
import { router } from "./wallet.router";
import { PrismaClient } from "../../generated/prisma";

export const walletModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = walletModule;
