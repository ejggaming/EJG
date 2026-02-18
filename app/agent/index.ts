import express, { Router } from "express";
import { controller } from "./agent.controller";
import { router } from "./agent.router";
import { PrismaClient } from "../../generated/prisma";

export const agentModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = agentModule;
