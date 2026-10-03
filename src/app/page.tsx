"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  bmrMifflin,
  tdee,
  projectFuture,
  reverseGoal,
  avatarStage,
  type Sex,
  type ActivityLevel,
} from "@/lib/prediction/engine";

// 3DアバターはWebGL依存のためクライアント専用で読み込む
const BodyAvatar3D = dynamic(() => import("@/components/BodyAvatar3D"), { ssr: false });

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "ほぼ運動なし",
  light: "軽い運動 週1-3",
  moderate: "中程度 週3-5",
  active: "活発 週6-7",
  very_active: "非常に活発",
};

export default function Home() {
  const [sex, setSex] = useState<Sex>("male");
  const [weight, setWeight] = useState(75);
  const [height, setHeight] = useState(173);
  const [age, setAge] = useState(28);
  const [bodyFat, setBodyFat] = useState(22);
  const [activity, setActivity] = useState<ActivityLevel>("light");
  const [intake, setIntake] = useState(1800);
  const [targetBf, setTargetBf] = useState(15);
  const [scrubDay, setScrubDay] = useState(90);

  const profile = { sex, weightKg: weight, heightCm: height, ageYr: age, bodyFatPct: bodyFat, activity };

  const t = useMemo(() => tdee(bmrMifflin(sex, weight, height, age), activity), [sex, weight, height, age, activity]);
  const plan = useMemo(() => reverseGoal(profile, targetBf), [sex, weight, height, age, bodyFat, activity, targetBf]);
  // スクラブ中の日にちでの予測（現在=0日〜1年）
  const scrub = useMemo(
    () => projectFuture(profile, intake, [scrubDay]).horizons[0],
    [sex, weight, height, age, bodyFat, activity, intake, scrubDay]
  );
  const scrubMidBf = (scrub.bodyFatPctRange[0] + scrub.bodyFatPctRange[1]) / 2;
  const scrubStage = avatarStage(sex, scrubMidBf);

  const accent = "#ad8fc6";

  return (
    <main className="min-h-screen bg-[#141617] text-neutral-100 px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: accent }}>カロミラー <span className="text-neutral-500 text-base font-normal">（仮）</span></h1>
          <p className="text-sm text-neutral-400 mt-1">今日の食事が、未来の体型に翻訳される。— 数値はすべて<strong>目安</strong>です（個人差あり・医療的予測ではありません）。</p>
        </header>

        <div className="grid md:grid-cols-[300px_1fr] gap-6">
          {/* 入力 */}
          <section className="rounded-xl bg-[#1c1f21] p-4 space-y-3 h-fit">
            <h2 className="text-sm font-semibold text-neutral-300">あなたの現在地</h2>
            <div className="flex gap-2">
              {(["male", "female"] as Sex[]).map((s) => (
                <button key={s} onClick={() => setSex(s)}
                  className={`flex-1 rounded-md py-1.5 text-sm ${sex === s ? "text-black" : "bg-[#2a2e30] text-neutral-300"}`}
                  style={sex === s ? { background: accent } : {}}>
                  {s === "male" ? "男性" : "女性"}
                </button>
              ))}
            </div>
            <Field label={`体重 ${weight}kg`}><input type="range" min={40} max={130} value={weight} onChange={(e) => setWeight(+e.target.value)} className="w-full" /></Field>
            <Field label={`身長 ${height}cm`}><input type="range" min={140} max={200} value={height} onChange={(e) => setHeight(+e.target.value)} className="w-full" /></Field>
            <Field label={`年齢 ${age}歳`}><input type="range" min={16} max={80} value={age} onChange={(e) => setAge(+e.target.value)} className="w-full" /></Field>
            <Field label={`体脂肪率 ${bodyFat}%`}><input type="range" min={5} max={45} value={bodyFat} onChange={(e) => setBodyFat(+e.target.value)} className="w-full" /></Field>
            <Field label="活動レベル">
              <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className="w-full rounded-md bg-[#2a2e30] p-1.5 text-sm">
                {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="pt-2 border-t border-white/10">
              <Field label={`1日の摂取カロリー ${intake}kcal`}><input type="range" min={1000} max={3500} step={50} value={intake} onChange={(e) => setIntake(+e.target.value)} className="w-full" /></Field>
              <p className="text-xs text-neutral-400">消費(TDEE) <strong>{t}</strong> kcal/日 ／ 収支 <strong style={{ color: intake - t < 0 ? "#7dd3fc" : "#fca5a5" }}>{intake - t > 0 ? "+" : ""}{intake - t}</strong> kcal/日</p>
            </div>
          </section>

          {/* 結果 */}
          <section className="space-y-6">
            {/* 未来タイムライン（回せる3Dアバター＋時間スクラブ） */}
            <div className="rounded-xl bg-[#1c1f21] p-4">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-sm font-semibold text-neutral-300">このまま続けたら（未来の体型・目安）</h2>
                <span className="text-xs text-neutral-500">
                  {scrubDay === 0 ? "ドラッグで回せます" : "薄い輪郭が いま ／ ドラッグで回せます"}
                </span>
              </div>

              <div className="rounded-lg bg-[#141617] overflow-hidden">
                <BodyAvatar3D bodyFatPct={scrubMidBf} nowBodyFatPct={bodyFat} sex={sex} color={accent} height={360} />
              </div>

              {/* 時間スクラブ */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium" style={{ color: accent }}>
                    {scrubDay === 0 ? "現在" : `${scrubDay}日後`}
                  </span>
                  <span className="text-neutral-300">
                    体重 <strong>{scrub.weightKgRange[0]}〜{scrub.weightKgRange[1]}kg</strong> ／ 体脂肪率 <strong>{scrub.bodyFatPctRange[0]}〜{scrub.bodyFatPctRange[1]}%</strong>
                  </span>
                </div>
                <input type="range" min={0} max={365} value={scrubDay} onChange={(e) => setScrubDay(+e.target.value)} className="w-full" />
                <div className="flex gap-2 mt-2">
                  {[0, 30, 90, 365].map((d) => (
                    <button key={d} onClick={() => setScrubDay(d)}
                      className={`flex-1 rounded-md py-1 text-xs ${scrubDay === d ? "text-black" : "bg-[#2a2e30] text-neutral-300"}`}
                      style={scrubDay === d ? { background: accent } : {}}>
                      {d === 0 ? "現在" : d === 365 ? "1年後" : `${d}日後`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 mt-2">{scrubStage.label}{scrubStage.belowEssential ? " ⚠️必須脂肪域" : ""}</p>
              </div>

              <p className="text-[11px] text-neutral-500 mt-3">
                ※アバターは「体脂肪率と一般的な体型傾向」に基づく<strong>目安</strong>で、体型変化を可視化するものです。遺伝・脂肪のつき方・皮膚等で実際とは異なります。仕上げでは自撮りから“あなた寄り”の顔を載せます（端末内処理）。
              </p>
            </div>

            {/* 逆算 */}
            <div className="rounded-xl bg-[#1c1f21] p-4">
              <h2 className="text-sm font-semibold text-neutral-300 mb-3">なりたい体から逆算</h2>
              <Field label={`目標の体脂肪率 ${targetBf}%（${avatarStage(sex, targetBf).label}）`}>
                <input type="range" min={5} max={40} value={targetBf} onChange={(e) => setTargetBf(+e.target.value)} className="w-full" />
              </Field>
              {plan.isSafe ? (
                <div className="mt-2 text-sm space-y-1">
                  <p>目標体重 <strong style={{ color: accent }}>{plan.targetWeightKg}kg</strong>（現在比 {plan.changeKg}kg）</p>
                  <p>安全ペースで <strong>約{plan.weeksAtSafePace}週</strong>（週0.75%）</p>
                  <p>摂取の目安 <strong>{plan.suggestedDailyIntakeKcal}kcal/日</strong>（収支 {plan.requiredDailyDeltaKcal}kcal/日）</p>
                  {plan.warnings.map((w, i) => <p key={i} className="text-xs text-amber-300">⚠️ {w}</p>)}
                </div>
              ) : (
                <div className="mt-2 text-sm text-rose-300 space-y-1">
                  <p>この目標は設定できません（健全性ガード）：</p>
                  {plan.warnings.map((w, i) => <p key={i} className="text-xs">・{w}</p>)}
                </div>
              )}
              {plan.isSafe && (
                <p className="text-[11px] text-neutral-500 mt-3">たんぱく質1.6〜2.2g/kg＋筋トレで筋肉を守りながら絞れます（§6-1）。—（将来ここに宅食/プロテインの送客枠）</p>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-8 text-[11px] text-neutral-600 leading-relaxed">
          本アプリの数値はすべて推定の目安です。医療・栄養の専門的助言に代わるものではありません。体調に不安がある場合は医師等にご相談ください。
          予測は動的エネルギー収支モデルの近似（NIH Body Weight Planner 型）に基づき、素朴な線形則（7,700kcal/kg）は長期で過大評価になるため使用していません。
        </footer>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
