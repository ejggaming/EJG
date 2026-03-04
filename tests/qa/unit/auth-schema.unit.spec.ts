import { expect } from "chai";
import { LoginSchema, RegisterSchema } from "../../../zod/auth.zod";

describe("QA Unit - Auth Schemas", () => {
	it("accepts a valid register payload", () => {
		const result = RegisterSchema.safeParse({
			email: "qa.unit@example.com",
			password: "StrongPass1!",
			firstName: "QA",
			lastName: "User",
			phoneNumber: "09171234567",
			role: "PLAYER",
			dateOfBirth: "1990-01-01",
		});

		expect(result.success).to.equal(true);
	});

	it("rejects underage registration payload", () => {
		const result = RegisterSchema.safeParse({
			email: "qa.underage@example.com",
			password: "StrongPass1!",
			firstName: "Too",
			lastName: "Young",
			phoneNumber: "09171234567",
			role: "PLAYER",
			dateOfBirth: "2015-01-01",
		});

		expect(result.success).to.equal(false);
	});

	it("rejects invalid login phone format", () => {
		const result = LoginSchema.safeParse({
			phoneNumber: "12345",
			password: "anything",
		});

		expect(result.success).to.equal(false);
	});
});
