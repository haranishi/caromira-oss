/**
 * カロミラー 未来予測エンジン
 * ------------------------------------------------------------------
 * カロリー収支 → 未来の体重・体脂肪率・アバター段階を推定するコア。
 * 根拠は要件定義追補 §5（エネルギー収支）/§6（体組成）。出典は各所に明記。
 *
 * 設計原則（§0 憲法）:
 *  - 予測は「点」でなく「レンジ（幅）」で返す（§5-5 の行動的代償のため）。
 *  - 体重は動的減速モデルで出す。素朴な線形則(7700kcal/kg)は長期で
 *    1.8〜2.6倍の過大評価になるため単独では使わない（§5-3 / Thomas 2014）。
 *  - 数値はすべて「目安」。医療的予測ではない。
 */

export type Sex = "male" | "female";

/** 活動レベル（フィットネス標準の活動係数。§5-2 ⚠️業界標準値） */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

/** 安全域の定数（§5-4 / §6-5）。⚠️国内一次資料での裏取りは公開前(§13 F-7) */
export const SAFETY = {
  /** 下限摂取カロリー（kcal/日） */
  minIntake: { male: 1500, female: 1200 } as Record<Sex, number>,
  /** 必須脂肪域の下限（これ未満は健康リスク＝目標設定不可） */
  essentialFatPct: { male: 5, female: 12 } as Record<Sex, number>,
  /** 安全な減量ペース（体重比/週）: 0.5〜1.0%。既定は中庸の0.75% */
  weeklyPacePct: 0.0075,
  /** 目標体重の下限 BMI */
  minBmi: 18.5,
} as const;

/**
 * BMR: Mifflin-St Jeor 式（1990）。§5-1。
 * 系統的レビュー(Frankenfield 2005)で誤差最小＝一般ユーザー既定。
 */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, ageYr: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYr;
  return sex === "male" ? base + 5 : base - 161;
}

/** TDEE = BMR × 活動係数。§5-2。運動を別途METsで足す場合は sedentary(1.2)固定にして二重計上を防ぐ。 */
export function tdee(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[activity]);
}

/**
 * 動的減速モデルの到達率 f(t)。§5-3。
 * 定常状態(ΔW_steady = ΔEI/24)への近づき方。
 * 「約1年で50%到達」に合わせた指数近似 f(t)=1-exp(-t/τ), τ=365/ln2。
 * ⚠️これは近似。厳密には脂肪/除脂肪の2時定数（1年50%・3年95%）で、
 *   単一指数は3年時点を過小評価する。予測地平(〜365日)では実用上妥当。
 *   高精度が要る場合は NIH Body Weight Planner を移植（§13 F-1）。
 */
const TAU_DAYS = 365 / Math.LN2; // ≈ 526.6

export function approachFraction(days: number): number {
  return 1 - Math.exp(-days / TAU_DAYS);
}

/**
 * 動的モデルによる体重予測（1点）。
 * @param dailyDeltaKcal 持続する1日の収支（摂取−TDEE）。負=赤字。
 * @returns days 日後の体重変化(kg)。負=減少。
 */
export function weightChangeDynamic(dailyDeltaKcal: number, days: number): number {
  const steady = dailyDeltaKcal / 24; // ΔW_steady(kg) ≈ ΔEI(kcal/日)/24  §5-3
  return steady * approachFraction(days);
}

/** 参考：素朴な線形則（比較・教育表示用。実予測には使わない）。§5-3 */
export function weightChangeLinear(dailyDeltaKcal: number, days: number): number {
  return (dailyDeltaKcal * days) / 7700;
}

/**
 * Forbes 則による体組成の追跡。§6-1 / Heymsfield 2014。
 *  FFM = 10.4·ln(FM) + C   （C は初期状態で確定）
 * 体脂肪が少ないほど体重変化に占める除脂肪(≒筋肉)割合が増える＝
 * 「痩せているほど筋肉が削れやすい」を表現。
 * ※これは栄養/運動が平均的な場合の受動的配分。高たんぱく＋レジスタンス
 *   運動(§6-1)は脂肪側へシフトさせる（MVPでは baseline を採用）。
 */
export function forbesConstant(fatMassKg: number, leanMassKg: number): number {
  return leanMassKg - 10.4 * Math.log(fatMassKg);
}

/** 目標総体重 W に対する脂肪量 FM を Forbes 曲線から数値解（二分法）。 */
export function fatMassAtWeight(totalWeightKg: number, C: number): number {
  // W = FM + 10.4·ln(FM) + C を FM について解く（FM は単調増加）
  let lo = 0.5;
  let hi = Math.max(2, totalWeightKg); // FM は総体重を超えない
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const w = mid + 10.4 * Math.log(mid) + C;
    if (w < totalWeightKg) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 体重変化 → 新しい体脂肪率(%) を Forbes で求める。
 * @returns { weightKg, bodyFatPct, fatMassKg, leanMassKg }
 */
export function projectComposition(
  startWeightKg: number,
  startBodyFatPct: number,
  newWeightKg: number
) {
  const fm0 = startWeightKg * (startBodyFatPct / 100);
  const lm0 = startWeightKg - fm0;
  const C = forbesConstant(fm0, lm0);
  const fm = fatMassAtWeight(newWeightKg, C);
  const lm = newWeightKg - fm;
  return {
    weightKg: round1(newWeightKg),
    bodyFatPct: round1((fm / newWeightKg) * 100),
    fatMassKg: round1(fm),
    leanMassKg: round1(lm),
  };
}

/* ------------------------------------------------------------------ */
/* アバター段階（体脂肪率 → 5段階）。§6-2 / §6-5 ACE-ACSM。            */
/* 男性5%刻み・女性4〜5%刻み。測定誤差(2〜5pt)以下の1%刻みはしない。   */
/* ------------------------------------------------------------------ */

export type AvatarStage = {
  stage: 1 | 2 | 3 | 4 | 5; // 1=最も絞れている … 5=最も脂肪が多い
  label: string;
  belowEssential: boolean; // 必須脂肪域より下＝健康リスク警告
};

const MALE_BANDS: { max: number; label: string }[] = [
  { max: 10, label: "アスリート級（絞れている）" },
  { max: 15, label: "フィット（腹筋の輪郭）" },
  { max: 20, label: "標準〜やや締まり" },
  { max: 25, label: "平均的" },
  { max: Infinity, label: "脂肪多め" },
];
const FEMALE_BANDS: { max: number; label: string }[] = [
  { max: 18, label: "アスリート級（絞れている）" },
  { max: 23, label: "フィット" },
  { max: 28, label: "健康的な平均" },
  { max: 33, label: "やや脂肪多め" },
  { max: Infinity, label: "脂肪多め" },
];

export function avatarStage(sex: Sex, bodyFatPct: number): AvatarStage {
  const bands = sex === "male" ? MALE_BANDS : FEMALE_BANDS;
  const idx = bands.findIndex((b) => bodyFatPct <= b.max);
  const stage = (idx + 1) as AvatarStage["stage"];
  return {
    stage,
    label: bands[idx].label,
    belowEssential: bodyFatPct < SAFETY.essentialFatPct[sex],
  };
}

/* ------------------------------------------------------------------ */
/* 統合：未来予測（レンジつき）                                        */
/* ------------------------------------------------------------------ */

export type Profile = {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYr: number;
  bodyFatPct: number; // 未入力時は呼び出し側で推定レンジを渡す（§FR-F01）
  activity: ActivityLevel;
};

export type HorizonProjection = {
  days: number;
  /** 体重（低め〜高めのレンジ）。low=控えめ(=よりリアル), high=モデル値 */
  weightKgRange: [number, number];
  bodyFatPctRange: [number, number];
  /** レンジ両端のアバター段階 */
  avatarStageRange: [AvatarStage, AvatarStage];
  /** 参考：線形則ならこれだけ減る（過大評価の可視化用） */
  naiveLinearWeightKg: number;
};

/**
 * 実測との乖離レンジ（§5-5）。現実は食事制限でモデル予測より12〜44%小さい。
 * → low(控えめ)= モデル×0.6, high= モデル×0.95 を既定の幅とする。⚠️要キャリブレ。
 */
const REALISM_LOW = 0.6;
const REALISM_HIGH = 0.95;

export function projectFuture(
  profile: Profile,
  dailyIntakeKcal: number,
  horizonsDays: number[] = [30, 90, 365]
): { targetIntakeVsTdee: number; tdee: number; horizons: HorizonProjection[] } {
  const bmr = bmrMifflin(profile.sex, profile.weightKg, profile.heightCm, profile.ageYr);
  const t = tdee(bmr, profile.activity);
  const delta = dailyIntakeKcal - t; // 負=赤字

  const horizons = horizonsDays.map((days): HorizonProjection => {
    const modelChange = weightChangeDynamic(delta, days); // kg（負=減少）
    const lowChange = modelChange * REALISM_LOW; // 変化が小さい側（控えめ）
    const highChange = modelChange * REALISM_HIGH;

    // 変化量の絶対値が大きい方が「よく変わった」側
    const wA = profile.weightKg + lowChange;
    const wB = profile.weightKg + highChange;
    const compA = projectComposition(profile.weightKg, profile.bodyFatPct, wA);
    const compB = projectComposition(profile.weightKg, profile.bodyFatPct, wB);

    // レンジは常に [小さい値, 大きい値] に整列
    const wRange: [number, number] = [Math.min(compA.weightKg, compB.weightKg), Math.max(compA.weightKg, compB.weightKg)];
    const bfRange: [number, number] = [Math.min(compA.bodyFatPct, compB.bodyFatPct), Math.max(compA.bodyFatPct, compB.bodyFatPct)];

    return {
      days,
      weightKgRange: wRange,
      bodyFatPctRange: bfRange,
      avatarStageRange: [avatarStage(profile.sex, bfRange[0]), avatarStage(profile.sex, bfRange[1])],
      naiveLinearWeightKg: round1(profile.weightKg + weightChangeLinear(delta, days)),
    };
  });

  return { targetIntakeVsTdee: delta, tdee: t, horizons };
}

/* ------------------------------------------------------------------ */
/* 逆算：なりたい体脂肪率 → 必要な収支・期間・安全判定（§FR-F07）        */
/* ------------------------------------------------------------------ */

export type GoalPlan = {
  targetWeightKg: number;
  targetBodyFatPct: number;
  changeKg: number;
  /** 安全ペースでの推定期間（週） */
  weeksAtSafePace: number;
  /** そのペースに必要な1日の収支（kcal・負=赤字） */
  requiredDailyDeltaKcal: number;
  /** その収支での1日の摂取目安 */
  suggestedDailyIntakeKcal: number;
  isSafe: boolean;
  warnings: string[];
};

export function reverseGoal(profile: Profile, targetBodyFatPct: number): GoalPlan {
  const warnings: string[] = [];

  // 目標体脂肪率に対応する体重を Forbes で求める（除脂肪の変化も加味）
  const fm0 = profile.weightKg * (profile.bodyFatPct / 100);
  const lm0 = profile.weightKg - fm0;
  const C = forbesConstant(fm0, lm0);
  // W = FM + LM, かつ FM/W = target/100, LM = 10.4·ln(FM)+C を満たす W を解く
  const targetWeight = solveWeightForBodyFat(targetBodyFatPct, C);
  const changeKg = targetWeight - profile.weightKg;

  // 安全ペース（体重比/週）
  const weeklyKg = profile.weightKg * SAFETY.weeklyPacePct;
  const weeks = Math.abs(changeKg) / weeklyKg;
  // そのペースに必要な1日の収支（線形近似：処方は線形でよい）
  const requiredDailyDelta = Math.sign(changeKg) * (weeklyKg * 7700) / 7;

  const bmr = bmrMifflin(profile.sex, profile.weightKg, profile.heightCm, profile.ageYr);
  const t = tdee(bmr, profile.activity);
  let intake = Math.round(t + requiredDailyDelta);

  // 安全ガード（§5-4 / §6-5）
  let isSafe = true;
  if (targetBodyFatPct < SAFETY.essentialFatPct[profile.sex]) {
    isSafe = false;
    warnings.push(`目標体脂肪率が必須脂肪域(${SAFETY.essentialFatPct[profile.sex]}%)を下回っています。健康リスクのため設定できません。`);
  }
  const bmi = targetWeight / (profile.heightCm / 100) ** 2;
  if (bmi < SAFETY.minBmi) {
    isSafe = false;
    warnings.push(`目標体重のBMIが${SAFETY.minBmi}未満です。過度な減量のため設定できません。`);
  }
  if (intake < SAFETY.minIntake[profile.sex]) {
    warnings.push(`必要摂取が下限(${SAFETY.minIntake[profile.sex]}kcal)を下回るため、下限に丸めペースを緩めます。`);
    intake = SAFETY.minIntake[profile.sex];
  }

  return {
    targetWeightKg: round1(targetWeight),
    targetBodyFatPct: round1(targetBodyFatPct),
    changeKg: round1(changeKg),
    weeksAtSafePace: Math.round(weeks * 10) / 10,
    requiredDailyDeltaKcal: Math.round(requiredDailyDelta),
    suggestedDailyIntakeKcal: intake,
    isSafe,
    warnings,
  };
}

/** 目標体脂肪率になる総体重 W を Forbes 制約下で解く（二分法）。 */
function solveWeightForBodyFat(targetBfPct: number, C: number): number {
  const target = targetBfPct / 100;
  // FM/(FM+LM)=target, LM=10.4 ln(FM)+C → FM = target·(FM+LM) を FM で解く
  let lo = 0.5;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const fm = (lo + hi) / 2;
    const lm = 10.4 * Math.log(fm) + C;
    const bf = fm / (fm + lm);
    if (bf < target) lo = fm;
    else hi = fm;
  }
  const fm = (lo + hi) / 2;
  const lm = 10.4 * Math.log(fm) + C;
  return fm + lm;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
