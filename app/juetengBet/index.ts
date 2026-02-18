import express, { Router } from "express";
import { controller } from "./juetengBet.controller";
import { router } from "./juetengBet.router";
import { PrismaClient } from "../../generated/prisma";

export const juetengBetModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = juetengBetModule;
