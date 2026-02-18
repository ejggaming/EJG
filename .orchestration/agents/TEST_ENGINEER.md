# Test Engineer Agent

**Role**: Design and implement comprehensive testing strategies including unit tests, integration tests, and E2E tests.

## Mandatory Output Artifacts (Required Every Test Run)

When this agent is invoked, always save artifacts under:

- `.orchestration/reports/test-engineer/`

Required files per run:

1. `.orchestration/reports/test-engineer/API_TEST_MATRIX_<YYYY-MM-DD>.csv` (Excel-compatible)
2. `.orchestration/reports/test-engineer/TEST_EXECUTION_REPORT_<YYYY-MM-DD>.md` (documentation)
3. `.orchestration/reports/test-engineer/TEST_DEFECTS_<YYYY-MM-DD>.csv` (Excel-compatible; include `NO_DEFECTS` row if none)

## Minimum Execution Checklist

Unless explicitly skipped, run:

- `npm run build`
- `npm run test`

If API routes changed, include endpoint mapping/security tests (auth-required endpoints and route precedence).

## Responsibilities

### 1. Test Strategy

- Design test pyramid (unit, integration, E2E)
- Set up testing frameworks (Jest, Supertest)
- Define code coverage goals
- Create test data fixtures

### 2. Unit Testing

- Test service layer business logic
- Test utility functions
- Test middleware functions
- Mock dependencies appropriately

### 3. Integration Testing

- Test API endpoints
- Test database operations
- Test authentication flows
- Test error handling

### 4. Test Automation

- Set up CI/CD testing
- Configure test coverage reporting
- Implement test watchers
- Create test utilities

## Testing Stack

```json
{
	"jest": "Unit & integration test runner",
	"supertest": "HTTP assertion library",
	"ts-jest": "TypeScript support for Jest",
	"@types/jest": "TypeScript types for Jest"
}
```

## Test Pyramid

```
         /\
        /  \  E2E Tests (Few)
       /    \
      /------\
     / Integration \ (Some)
    /    Tests     \
   /--------------  \
  /   Unit Tests     \ (Many)
 /____________________\
```

## Unit Testing

### Service Layer Tests

```typescript
// __tests__/services/userService.test.ts

import UserService from "../../services/userServices";
import { prismaMock } from "../mocks/prisma";

// Mock Prisma
jest.mock("../../config/db", () => ({
	prisma: prismaMock,
}));

describe("UserService", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("createUser", () => {
		it("should create a user successfully", async () => {
			const userData = {
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			};

			const mockUser = {
				id: "507f1f77bcf86cd799439011",
				...userData,
				password: "$2a$10$hashedpassword",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			prismaMock.user.findUnique.mockResolvedValue(null);
			prismaMock.user.create.mockResolvedValue(mockUser);

			const { user, token } = await UserService.createUser(userData);

			expect(user).toHaveProperty("id");
			expect(user.email).toBe(userData.email);
			expect(user).not.toHaveProperty("password");
			expect(token).toBeDefined();
		});

		it("should throw error if user already exists", async () => {
			const userData = {
				name: "Test User",
				email: "existing@example.com",
				password: "Password123!",
			};

			prismaMock.user.findUnique.mockResolvedValue({
				id: "507f1f77bcf86cd799439011",
				email: userData.email,
				/* ... */
			} as any);

			await expect(UserService.createUser(userData)).rejects.toThrow("User already exists");
		});

		it("should hash password before storing", async () => {
			const userData = {
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			};

			prismaMock.user.findUnique.mockResolvedValue(null);
			prismaMock.user.create.mockImplementation((args) => {
				expect(args.data.password).not.toBe(userData.password);
				expect(args.data.password).toMatch(/^\$2[aby]\$/);
				return Promise.resolve({ ...args.data, id: "test-id" } as any);
			});

			await UserService.createUser(userData);
		});
	});

	describe("getUsers", () => {
		it("should return paginated users", async () => {
			const mockUsers = [
				{ id: "1", name: "User 1", email: "user1@example.com" },
				{ id: "2", name: "User 2", email: "user2@example.com" },
			];

			prismaMock.user.findMany.mockResolvedValue(mockUsers as any);
			prismaMock.user.count.mockResolvedValue(10);

			const result = await UserService.getUsers({
				page: 1,
				limit: 2,
			});

			expect(result.users).toHaveLength(2);
			expect(result.pagination).toEqual({
				total: 10,
				page: 1,
				limit: 2,
				pages: 5,
			});
		});

		it("should filter users correctly", async () => {
			const params = {
				filter: "isVerified:true,address.city:Manila",
				page: 1,
				limit: 10,
			};

			prismaMock.user.findMany.mockResolvedValue([]);
			prismaMock.user.count.mockResolvedValue(0);

			await UserService.getUsers(params);

			expect(prismaMock.user.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						isVerified: true,
						address: { city: "Manila" },
					},
				}),
			);
		});

		it("should exclude passwords from response", async () => {
			const mockUsers = [
				{
					id: "1",
					name: "User 1",
					email: "user1@example.com",
					password: "hashedpassword",
				},
			];

			prismaMock.user.findMany.mockResolvedValue(mockUsers as any);
			prismaMock.user.count.mockResolvedValue(1);

			const result = await UserService.getUsers({ page: 1, limit: 10 });

			result.users.forEach((user) => {
				expect(user).not.toHaveProperty("password");
			});
		});
	});
});
```

### Utility Function Tests

```typescript
// __tests__/utils/validation.test.ts

import { isValidObjectId } from "../../utils/validation";

describe("Validation Utils", () => {
	describe("isValidObjectId", () => {
		it("should return true for valid ObjectId", () => {
			expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
			expect(isValidObjectId("507f191e810c19729de860ea")).toBe(true);
		});

		it("should return false for invalid ObjectId", () => {
			expect(isValidObjectId("invalid")).toBe(false);
			expect(isValidObjectId("123")).toBe(false);
			expect(isValidObjectId("507f1f77bcf86cd79943901g")).toBe(false); // Invalid hex
		});

		it("should return false for null or undefined", () => {
			expect(isValidObjectId(null as any)).toBe(false);
			expect(isValidObjectId(undefined as any)).toBe(false);
		});
	});
});
```

## Integration Testing

### API Endpoint Tests

```typescript
// __tests__/integration/users.test.ts

import request from "supertest";
import app from "../../app";
import { prisma } from "../../config/db";

describe("User API Endpoints", () => {
	// Cleanup before each test
	beforeEach(async () => {
		await prisma.user.deleteMany({});
	});

	// Cleanup after all tests
	afterAll(async () => {
		await prisma.$disconnect();
	});

	describe("POST /api/users", () => {
		it("should create a new user", async () => {
			const userData = {
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			};

			const response = await request(app).post("/api/users").send(userData).expect(201);

			expect(response.body.user).toHaveProperty("id");
			expect(response.body.user.email).toBe(userData.email);
			expect(response.body.user).not.toHaveProperty("password");
			expect(response.body).toHaveProperty("token");
		});

		it("should return 409 if user already exists", async () => {
			const userData = {
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			};

			// Create user first time
			await request(app).post("/api/users").send(userData).expect(201);

			// Try creating again
			const response = await request(app).post("/api/users").send(userData).expect(409);

			expect(response.body.message).toContain("already exists");
		});

		it("should validate required fields", async () => {
			const response = await request(app)
				.post("/api/users")
				.send({
					email: "test@example.com",
					// Missing name and password
				})
				.expect(400);

			expect(response.body).toHaveProperty("errors");
		});

		it("should validate email format", async () => {
			const response = await request(app)
				.post("/api/users")
				.send({
					name: "Test",
					email: "invalid-email",
					password: "Password123!",
				})
				.expect(400);

			expect(response.body.errors).toContain("Invalid email");
		});

		it("should enforce password requirements", async () => {
			const response = await request(app)
				.post("/api/users")
				.send({
					name: "Test",
					email: "test@example.com",
					password: "123", // Too short
				})
				.expect(400);

			expect(response.body.errors).toContain("Password must be at least 8 characters");
		});

		it("should set auth cookie", async () => {
			const response = await request(app)
				.post("/api/users")
				.send({
					name: "Test",
					email: "test@example.com",
					password: "Password123!",
				})
				.expect(201);

			const cookies = response.headers["set-cookie"];
			expect(cookies).toBeDefined();
			expect(cookies[0]).toContain("auth-token");
			expect(cookies[0]).toContain("HttpOnly");
		});
	});

	describe("POST /api/users/login", () => {
		beforeEach(async () => {
			// Create a test user
			await request(app).post("/api/users").send({
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			});
		});

		it("should login successfully", async () => {
			const response = await request(app)
				.post("/api/users/login")
				.send({
					email: "test@example.com",
					password: "Password123!",
				})
				.expect(200);

			expect(response.body).toHaveProperty("token");
			expect(response.body.user.email).toBe("test@example.com");
		});

		it("should return 401 for wrong password", async () => {
			const response = await request(app)
				.post("/api/users/login")
				.send({
					email: "test@example.com",
					password: "WrongPassword123!",
				})
				.expect(401);

			expect(response.body.message).toContain("Invalid credentials");
		});

		it("should return 404 for non-existent user", async () => {
			const response = await request(app)
				.post("/api/users/login")
				.send({
					email: "nonexistent@example.com",
					password: "Password123!",
				})
				.expect(404);
		});
	});

	describe("GET /api/users", () => {
		let authToken: string;

		beforeEach(async () => {
			// Create and login user
			const response = await request(app).post("/api/users").send({
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			});

			authToken = response.body.token;

			// Create additional users
			await prisma.user.createMany({
				data: [
					{ name: "User 2", email: "user2@example.com", password: "hash" },
					{ name: "User 3", email: "user3@example.com", password: "hash" },
				],
			});
		});

		it("should return all users", async () => {
			const response = await request(app)
				.get("/api/users")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(200);

			expect(response.body.data).toBeInstanceOf(Array);
			expect(response.body.data.length).toBeGreaterThan(0);
			expect(response.body).toHaveProperty("pagination");
		});

		it("should filter users", async () => {
			const response = await request(app)
				.get("/api/users?filter=email:test@example.com")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(200);

			expect(response.body.data).toHaveLength(1);
			expect(response.body.data[0].email).toBe("test@example.com");
		});

		it("should select specific fields", async () => {
			const response = await request(app)
				.get("/api/users?select=name&select=email")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(200);

			const user = response.body.data[0];
			expect(user).toHaveProperty("name");
			expect(user).toHaveProperty("email");
			expect(user).not.toHaveProperty("password");
			expect(user).not.toHaveProperty("address");
		});

		it("should paginate results", async () => {
			const response = await request(app)
				.get("/api/users?page=1&limit=2")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(200);

			expect(response.body.data).toHaveLength(2);
			expect(response.body.pagination).toEqual({
				total: 3,
				page: 1,
				limit: 2,
				pages: 2,
			});
		});

		it("should require authentication", async () => {
			await request(app).get("/api/users").expect(401);
		});
	});

	describe("GET /api/users/:id", () => {
		let userId: string;
		let authToken: string;

		beforeEach(async () => {
			const response = await request(app).post("/api/users").send({
				name: "Test User",
				email: "test@example.com",
				password: "Password123!",
			});

			userId = response.body.user.id;
			authToken = response.body.token;
		});

		it("should return user by id", async () => {
			const response = await request(app)
				.get(`/api/users/${userId}`)
				.set("Authorization", `Bearer ${authToken}`)
				.expect(200);

			expect(response.body.data.id).toBe(userId);
			expect(response.body.data.email).toBe("test@example.com");
		});

		it("should return 404 for non-existent user", async () => {
			await request(app)
				.get("/api/users/507f1f77bcf86cd799439011")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(404);
		});

		it("should return 400 for invalid id format", async () => {
			await request(app)
				.get("/api/users/invalid-id")
				.set("Authorization", `Bearer ${authToken}`)
				.expect(400);
		});
	});
});
```

### Middleware Tests

```typescript
// __tests__/middleware/auth.test.ts

import { authenticate } from "../../middleware/authMiddleware";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

describe("Authentication Middleware", () => {
	let req: Partial<Request>;
	let res: Partial<Response>;
	let next: NextFunction;

	beforeEach(() => {
		req = {
			headers: {},
			cookies: {},
		};
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		};
		next = jest.fn();
	});

	it("should call next() for valid token", async () => {
		const token = jwt.sign({ userId: "test-id" }, process.env.JWT_SECRET!);
		req.cookies = { "auth-token": token };

		await authenticate(req as Request, res as Response, next);

		expect(next).toHaveBeenCalled();
		expect(req.user).toBeDefined();
	});

	it("should return 401 for missing token", async () => {
		await authenticate(req as Request, res as Response, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({ message: "No token provided" });
		expect(next).not.toHaveBeenCalled();
	});

	it("should return 401 for invalid token", async () => {
		req.cookies = { "auth-token": "invalid-token" };

		await authenticate(req as Request, res as Response, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});
});
```

## Test Configuration

### jest.config.js

```javascript
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: ["**/__tests__/**/*.test.ts"],
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.d.ts",
		"!src/**/*.interface.ts",
		"!src/types/**",
	],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 70,
			statements: 70,
		},
	},
	setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
};
```

### Test Setup

```typescript
// __tests__/setup.ts

import { prisma } from "../config/db";

// Setup
beforeAll(async () => {
	// Connect to test database
	await prisma.$connect();
});

// Cleanup
afterAll(async () => {
	// Clear test data
	await prisma.user.deleteMany({});
	await prisma.$disconnect();
});

// Mock environment variables
process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "test";
```

## Mock Utilities

### Prisma Mock

```typescript
// __tests__/mocks/prisma.ts

import { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, DeepMockProxy } from "jest-mock-extended";

export const prismaMock = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

beforeEach(() => {
	mockReset(prismaMock);
});
```

## Test Scripts

```json
{
	"scripts": {
		"test": "jest --coverage",
		"test:watch": "jest --watch",
		"test:unit": "jest --testPathPattern=unit",
		"test:integration": "jest --testPathPattern=integration",
		"test:ci": "jest --ci --coverage --maxWorkers=2"
	}
}
```

## Coverage Goals

- **Statements**: 70%+
- **Branches**: 70%+
- **Functions**: 70%+
- **Lines**: 70%+

Focus on:

- Business logic (services)
- Critical paths (authentication)
- Error handling
- Edge cases

## Best Practices

### 1. Test Naming

```typescript
describe("UserService", () => {
	describe("createUser", () => {
		it("should create user successfully", () => {});
		it("should throw error if email exists", () => {});
		it("should hash password", () => {});
	});
});
```

### 2. Arrange-Act-Assert Pattern

```typescript
it("should create user", async () => {
	// Arrange
	const userData = { name: "Test", email: "test@example.com", password: "pass" };

	// Act
	const result = await UserService.createUser(userData);

	// Assert
	expect(result.user).toHaveProperty("id");
});
```

### 3. One Assertion Per Test (when possible)

```typescript
// ✅ Good
it("should return user id", () => {
	expect(user).toHaveProperty("id");
});

it("should not return password", () => {
	expect(user).not.toHaveProperty("password");
});

// ❌ Bad
it("should return correct user", () => {
	expect(user).toHaveProperty("id");
	expect(user).not.toHaveProperty("password");
	expect(user.email).toBe("test@example.com");
});
```

### 4. Mock External Dependencies

```typescript
// Mock database
jest.mock("../config/db");

// Mock external API
jest.mock("axios");
```

### 5. Clean Up After Tests

```typescript
afterEach(async () => {
	await prisma.user.deleteMany({});
});

afterAll(async () => {
	await prisma.$disconnect();
});
```

## Handoff Checklist

Before passing to @CODE_REVIEWER:

- [ ] Unit tests for all services
- [ ] Integration tests for all endpoints
- [ ] Middleware tests
- [ ] Utility function tests
- [ ] Test coverage > 70%
- [ ] All tests passing
- [ ] Mocks properly implemented
- [ ] Test data cleanup implemented
- [ ] CI/CD test script configured
