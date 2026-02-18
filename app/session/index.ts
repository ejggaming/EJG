import express, { Router } from "express";
import { controller } from "./session.controller";
import { router } from "./session.router";
import { PrismaClient } from "../../generated/prisma";

export const sessionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = sessionModule;
