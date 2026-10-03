/**
 * アバターの「仮」表現（プレースホルダ）。
 * 体脂肪率の段階(1〜5)で胴回りが変わる正面シルエット。
 * ★これは繋ぎ。本番は §7 の二層構成（MakeHuman(CC0)ボディ→three.js morph
 *   ＋顔の"自分寄り"オンデバイス層）に差し替える。ここでは「体型が段階で
 *   変わる」体験だけを先に可視化する。
 */
type Props = {
  stage: 1 | 2 | 3 | 4 | 5;
  label?: string;
  sub?: string;
  accent?: string;
};

// 段階 → 胴回り倍率（1=絞れ, 5=脂肪多め）
const GIRTH: Record<number, number> = { 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.18, 5: 1.4 };

export default function AvatarSilhouette({ stage, label, sub, accent = "#ad8fc6" }: Props) {
  const g = GIRTH[stage];
  const cx = 60;
  // 各部の幅を girth でスケール
  const shoulder = 26;
  const waist = 15 * g;
  const hip = 19 * g;
  const chest = 22 * g;

  // 胴体の輪郭（左右対称）を単純なパスで
  const torso = [
    `M ${cx - shoulder} 52`,
    `C ${cx - chest} 66, ${cx - waist} 78, ${cx - waist} 92`,
    `C ${cx - hip} 104, ${cx - hip} 118, ${cx - hip * 0.8} 130`,
    `L ${cx + hip * 0.8} 130`,
    `C ${cx + hip} 118, ${cx + hip} 104, ${cx + waist} 92`,
    `C ${cx + waist} 78, ${cx + chest} 66, ${cx + shoulder} 52`,
    `Z`,
  ].join(" ");

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 180" width="120" height="180" role="img" aria-label={label ?? `体型段階${stage}`}>
        {/* 脚 */}
        <rect x={cx - hip * 0.7} y={128} width={hip * 0.6} height={44} rx={7} fill={accent} opacity={0.85} />
        <rect x={cx + hip * 0.1} y={128} width={hip * 0.6} height={44} rx={7} fill={accent} opacity={0.85} />
        {/* 腕 */}
        <rect x={cx - shoulder - 4} y={54} width={8} height={54} rx={4} fill={accent} opacity={0.7} />
        <rect x={cx + shoulder - 4} y={54} width={8} height={54} rx={4} fill={accent} opacity={0.7} />
        {/* 胴体 */}
        <path d={torso} fill={accent} />
        {/* 首・頭 */}
        <rect x={cx - 5} y={40} width={10} height={14} rx={3} fill={accent} />
        <circle cx={cx} cy={28} r={13} fill={accent} />
      </svg>
      {label && <div className="text-sm font-medium">{label}</div>}
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}
