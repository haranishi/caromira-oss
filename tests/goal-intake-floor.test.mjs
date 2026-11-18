import assert from "node:assert/strict";
import test from "node:test";
import { bmrMifflin, reverseGoal, tdee } from "../src/lib/prediction/engine.ts";

const profile = {
  sex: "female", weightKg: 60, heightCm: 160,
  ageYr: 45, bodyFatPct: 35, activity: "sedentary",
};

function maintenanceCalories({ sex, weightKg, heightCm, ageYr, activity }) {
  return tdee(bmrMifflin(sex, weightKg, heightCm, ageYr), activity);
}

test("an intake floor that slows weight loss also changes the balance and duration", () => {
  const plan = reverseGoal(profile, 33);
  assert.equal(plan.isSafe, true);
  assert.equal(plan.suggestedDailyIntakeKcal, 1200);
  assert.equal(plan.requiredDailyDeltaKcal, 1200 - maintenanceCalories(profile));
  assert.equal(plan.weeksAtSafePace, 15.8);
});

test("the floor cannot produce a weight-loss plan if it meets or exceeds maintenance", () => {
  for (const [heightCm, ageYr] of [[149, 74], [150, 76]]) {
    const input = { ...profile, heightCm, ageYr };
    assert.ok(maintenanceCalories(input) <= 1200);
    const plan = reverseGoal(input, 33);
    assert.equal(plan.isSafe, false);
    assert.equal(plan.weeksAtSafePace, null);
    assert.ok(plan.warnings.some(warning => warning.includes("摂取下限")));
  }
});

test("the floor cannot turn a weight-gain plan into a faster-than-allowed plan", () => {
  const input = {
    sex: "male", weightKg: 40, heightCm: 140,
    ageYr: 80, bodyFatPct: 20, activity: "sedentary",
  };
  const plan = reverseGoal(input, 23);
  assert.equal(plan.isSafe, false);
  assert.equal(plan.weeksAtSafePace, null);
});
