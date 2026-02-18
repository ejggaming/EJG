import express, { Router } from "express";
import { controller } from "./auth.controller";
import { router } from "./auth.router";
import { PrismaClient } from "../../generated/prisma";

export const authModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = authModule;
