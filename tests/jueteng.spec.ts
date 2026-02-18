import { expect } from "chai";

// ─── Pure game logic helpers (no DB needed) ───────────────────────────────────

function buildCombinationKey(n1: number, n2: number): string {
  return [n1, n2].sort((a, b) => a - b).join("-");
}

function isWinner(drawn: [number, number], picked: [number, number]): boolean {
  return buildCombinationKey(...drawn) === buildCombinationKey(...picked);
}

function calcPayout(stake: number, multiplier: number): number {
  return stake * multiplier;
}

function calcCommission(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

function isValidNumber(n: number, maxNumber = 37): boolean {
  return Number.isInteger(n) && n >= 1 && n <= maxNumber;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Jueteng — Game Logic", () => {
  describe("Combination key", () => {
    it("should produce same key regardless of input order", () => {
      expect(buildCombinationKey(5, 12)).to.equal(buildCombinationKey(12, 5));
    });
    it("should handle repeat numbers", () => {
      expect(buildCombinationKey(7, 7)).to.equal("7-7");
    });
    it("should sort numerically not lexicographically", () => {
      expect(buildCombinationKey(2, 10)).to.equal("2-10");
    });
  });

  describe("Winner check", () => {
    it("wins when numbers match in same order", () => {
      expect(isWinner([5, 12], [5, 12])).to.be.true;
    });
    it("wins when numbers match in reverse order", () => {
      expect(isWinner([5, 12], [12, 5])).to.be.true;
    });
    it("loses when only one number matches", () => {
      expect(isWinner([5, 12], [5, 7])).to.be.false;
    });
    it("loses when neither number matches", () => {
      expect(isWinner([5, 12], [3, 8])).to.be.false;
    });
    it("handles repeat drawn numbers", () => {
      expect(isWinner([7, 7], [7, 7])).to.be.true;
      expect(isWinner([7, 7], [7, 5])).to.be.false;
    });
  });

  describe("Payout calculation", () => {
    it("returns 500× payout for 1-peso bet", () => {
      expect(calcPayout(1, 500)).to.equal(500);
    });
    it("returns 5000 for 10-peso bet at 500×", () => {
      expect(calcPayout(10, 500)).to.equal(5000);
    });
    it("returns 0 for 0-peso bet", () => {
      expect(calcPayout(0, 500)).to.equal(0);
    });
  });

  describe("Commission calculation", () => {
    it("cobrador earns 15% of collected stake", () => {
      expect(calcCommission(100, 0.15)).to.equal(15);
    });
    it("cabo earns 5% of winner payout", () => {
      expect(calcCommission(500, 0.05)).to.equal(25);
    });
    it("capitalista earns 25% of total collections", () => {
      expect(calcCommission(1000, 0.25)).to.equal(250);
    });
    it("rounds to 2 decimal places", () => {
      expect(calcCommission(1, 0.15)).to.equal(0.15);
    });
  });

  describe("Number validation", () => {
    it("accepts numbers 1–37", () => {
      expect(isValidNumber(1)).to.be.true;
      expect(isValidNumber(37)).to.be.true;
      expect(isValidNumber(18)).to.be.true;
    });
    it("rejects 0 and negative numbers", () => {
      expect(isValidNumber(0)).to.be.false;
      expect(isValidNumber(-1)).to.be.false;
    });
    it("rejects numbers above maxNumber", () => {
      expect(isValidNumber(38)).to.be.false;
      expect(isValidNumber(100)).to.be.false;
    });
    it("rejects non-integers", () => {
      expect(isValidNumber(3.5)).to.be.false;
    });
    it("respects custom maxNumber", () => {
      expect(isValidNumber(38, 40)).to.be.true;
      expect(isValidNumber(41, 40)).to.be.false;
    });
  });
});
