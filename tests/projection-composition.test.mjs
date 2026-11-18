import assert from "node:assert/strict";
import test from "node:test";
import { projectComposition, projectFuture } from "../src/lib/prediction/engine.ts";

const profile = {
  sex: "male", weightKg: 40, heightCm: 200,
  ageYr: 16, bodyFatPct: 45, activity: "very_active",
};

test("a forecast that would require negative lean mass is unavailable", () => {
  const [current, future] = projectFuture(profile, 1000, [0, 365]).horizons;
  assert.deepEqual(current.weightKgRange, [40, 40]);
  assert.deepEqual(current.bodyFatPctRange, [45, 45]);
  assert.deepEqual(future, { days: 365, available: false });
});

test("a valid range includes a body-fat minimum between its weight endpoints", () => {
  const leanProfile = { ...profile, bodyFatPct: 5 };
  const [future] = projectFuture(leanProfile, 1000, [365]).horizons;
  assert.ok(
    future.bodyFatPctRange[0] < projectComposition(40, 5, future.weightKgRange[1]).bodyFatPct,
  );
  assert.ok(future.bodyFatPctRange[1] < 10);
});

test("a normal forecast keeps its existing endpoints", () => {
  const example = {
    sex: "male", weightKg: 75, heightCm: 173,
    ageYr: 28, bodyFatPct: 22, activity: "light",
  };
  const [future] = projectFuture(example, 1800, [365]).horizons;
  assert.deepEqual(future.weightKgRange, [64.5, 68.4]);
  assert.deepEqual(future.bodyFatPctRange, [16.4, 18.5]);
});
