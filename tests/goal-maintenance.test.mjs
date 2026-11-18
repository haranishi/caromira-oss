import assert from "node:assert/strict";
import test from "node:test";
import { reverseGoal } from "../src/lib/prediction/engine.ts";

test("the starting body-fat percentage is a maintenance goal", () => {
  for (const profile of [
    { sex: "female", weightKg: 60, heightCm: 160, ageYr: 45, bodyFatPct: 35, activity: "sedentary" },
    { sex: "male", weightKg: 75, heightCm: 173, ageYr: 28, bodyFatPct: 35, activity: "light" },
  ]) {
    const plan = reverseGoal(profile, profile.bodyFatPct);
    assert.equal(plan.isSafe, true);
    assert.equal(plan.targetWeightKg, profile.weightKg);
    assert.equal(plan.requiredDailyDeltaKcal, 0);
    assert.equal(plan.changeKg, 0);
    assert.equal(plan.weeksAtSafePace, 0);
    assert.deepEqual(plan.warnings, []);
  }
});
