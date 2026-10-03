/**
 * 予測エンジンの動作確認デモ。
 * 実行: npx tsx src/lib/prediction/demo.ts
 */
import {
  bmrMifflin,
  tdee,
  projectFuture,
  reverseGoal,
  avatarStage,
  weightChangeLinear,
  weightChangeDynamic,
  type Profile,
} from "./engine";

function line() {
  console.log("─".repeat(60));
}

// サンプル：28歳男性・75kg・173cm・体脂肪率22%・軽い活動
const profile: Profile = {
  sex: "male",
  weightKg: 75,
  heightCm: 173,
  ageYr: 28,
  bodyFatPct: 22,
  activity: "light",
};

const bmr = bmrMifflin(profile.sex, profile.weightKg, profile.heightCm, profile.ageYr);
const t = tdee(bmr, profile.activity);

console.log("\n【入力】28歳男性 75kg / 173cm / 体脂肪率22% / 軽い活動");
console.log(`BMR = ${Math.round(bmr)} kcal/日   TDEE = ${t} kcal/日`);

// 1日1800kcal（＝約500kcal赤字）で続けたら？
const intake = 1800;
line();
console.log(`【未来予測】毎日 ${intake} kcal（収支 ${intake - t} kcal/日）を続けたら`);
const proj = projectFuture(profile, intake);
for (const h of proj.horizons) {
  const [wl, wh] = h.weightKgRange;
  const [bl, bh] = h.bodyFatPctRange;
  console.log(
    `  ${String(h.days).padStart(3)}日後: 体重 ${wl}〜${wh}kg / 体脂肪率 ${bl}〜${bh}% ` +
      `/ アバター段階 ${h.avatarStageRange[1].stage}→${h.avatarStageRange[0].stage} ` +
      `（${h.avatarStageRange[0].label}）  ※線形則の素朴計算なら ${h.naiveLinearWeightKg}kg`
  );
}
console.log("  ↑ 予測は幅（レンジ）。線形則は長期ほど過大評価になる（比較用）。");

// 線形 vs 動的の乖離（§5-3 の検証：140kcal/日×365日）
line();
console.log("【線形則 vs 動的モデルの乖離】140kcal/日の赤字を1年:");
console.log(`  線形則 : ${(-weightChangeLinear(-140, 365)).toFixed(1)} kg減  (研究値≒6.8kg/15lbs)`);
console.log(`  動的   : ${(-weightChangeDynamic(-140, 365)).toFixed(1)} kg減  (研究のHall値≒3.7kg/8.2lbs)`);

// 逆算：体脂肪率15%になりたい
line();
console.log("【逆算】体脂肪率15%（フィット段階）を目指すと:");
const plan = reverseGoal(profile, 15);
console.log(`  目標体重 ${plan.targetWeightKg}kg（現在比 ${plan.changeKg}kg） / 体脂肪率 ${plan.targetBodyFatPct}%`);
console.log(`  安全ペース(週0.75%)で 約${plan.weeksAtSafePace}週`);
console.log(`  必要な収支 ${plan.requiredDailyDeltaKcal}kcal/日 → 摂取目安 ${plan.suggestedDailyIntakeKcal}kcal/日`);
console.log(`  安全? ${plan.isSafe ? "OK" : "NG"} ${plan.warnings.join(" / ")}`);

// 安全ガードのテスト：男性で体脂肪率3%（必須脂肪域）を目標にしたら弾く
line();
console.log("【安全ガード】男性が体脂肪率3%を目標にした場合:");
const unsafe = reverseGoal(profile, 3);
console.log(`  安全? ${unsafe.isSafe ? "OK" : "NG（正しく弾ける）"} — ${unsafe.warnings.join(" / ")}`);

// アバター段階の確認
line();
console.log("【アバター段階マップ（男性）】");
for (const bf of [8, 13, 18, 23, 30]) {
  const s = avatarStage("male", bf);
  console.log(`  体脂肪率${bf}% → 段階${s.stage}（${s.label}）${s.belowEssential ? " ⚠️必須脂肪域" : ""}`);
}
console.log();
