"use client";

/**
 * 回せる3D体型アバター（§7 二層構成の①＝体のレイヤー）。
 *
 * 体脂肪率 → fatness(0..1) → シェイプキーの重み、という一本道で変形する。
 * 姿勢も身長も頭の大きさも動かず、変わるのは腹・腰・腿・二の腕だけ。
 *
 * 素体は CC0 の実在の人体メッシュ（public/models/body-{male,female}.glb・
 * 出どころと加工手順は同ディレクトリの CREDITS.md と tools/build-body.py）。
 * 「fat」シェイプキーが1本だけ入っていて、それを 0→1 で動かす。
 * 顔の"自分寄り"は別レイヤー（オンデバイス）で後付け（§7-1 ②）。
 *
 * ## 半透明の「いま」を重ねている理由
 * 未来の体だけを出しても、見ている人は前の自分の輪郭を覚えていないので
 * 痩せたのか太ったのかが読み取れない。いまの体を薄い殻として同じ位置に置き、
 * 殻からはみ出す／殻の内側に収まる、で差を見せる。
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useState, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Sex } from "@/lib/prediction/engine";

const MODEL: Record<Sex, string> = {
  male: "/models/body-male.glb",
  female: "/models/body-female.glb",
};

/** 足裏が原点のモデルを、画面の真ん中あたりに置くための下げ幅 */
const GROUND = -0.88;

/**
 * 体そのものは、肌色ではなく粘土のマネキン色で塗る。
 * ①この体は「あなた」ではなく目安の型なので、特定の肌の色に寄せない
 * ②アクセントの紫をそのまま体に塗ると、光が回ったとき一色に潰れて凹凸が読めない
 * 紫はリムライトと「いま」の殻に回して、画面の色の統一はそちらで取る。
 */
const CLAY = "#e0cabb";

/** 入力スライダーの上端。ここまでは体が動かないと困る */
const INPUT_MAX = 45;
/** よくある体脂肪率の範囲に、見た目の変化の何割を割り当てるか */
const KNEE = 0.85;

/**
 * 体脂肪率(%) → fatness(0..1)。見た目の可変レンジにマッピング（§6-2）。
 *
 * lo〜hi によくある範囲を当て、そこに変化の85%を使う。
 * ⚠️ hi で頭打ちにしてはいけない。女性の hi は40%なので、45%の人が1年かけて
 * 43%まで落としても体が1ミリも動かず、「減っているのに変わらない」になる。
 * hi より上は詰めて入れて、スライダーの上端まで必ず動くようにしている。
 */
export function fatnessFromBodyFat(sex: Sex, bodyFatPct: number): number {
  const lo = sex === "male" ? 8 : 16;
  const hi = sex === "male" ? 33 : 40;
  if (bodyFatPct <= lo) return 0;
  if (bodyFatPct <= hi) return ((bodyFatPct - lo) / (hi - lo)) * KNEE;
  return clamp(KNEE + ((bodyFatPct - hi) / (INPUT_MAX - hi)) * (1 - KNEE), 0, 1);
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

type Loaded = { future: THREE.Mesh; now: THREE.Mesh };

/** GLBを読んで、同じジオメトリから「未来（実体）」と「いま（殻）」の2体を作る。 */
function useBody(sex: Sex, color: string): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    /* drei の useGLTF はサスペンスする＝読み込み中に描画ループが止まるので、
       自前で読んで、出来上がってから差し込む。 */
    new GLTFLoader().load(MODEL[sex], (gltf) => {
      if (!alive) return;
      let src: THREE.Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
      });
      if (!src) return;
      const geometry = (src as THREE.Mesh).geometry;

      const future = new THREE.Mesh(
        geometry,
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(CLAY),
          roughness: 0.74,
          metalness: 0,
          // 肌は真正面より縁のほうが明るく見える。sheen でその落ち方を作る。
          // 強くすると全体が光って凹凸が消えるので、気づかない程度に留める
          sheen: 0.25,
          sheenRoughness: 0.9,
          sheenColor: new THREE.Color("#ffd7c6"),
        })
      );

      /* 「いま」は殻。奥行きを書かない（depthWrite: false）ので、
         中に入った実体が透けて見え、はみ出した所だけ外に出る。 */
      const now = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      now.renderOrder = 2;

      for (const m of [future, now]) {
        m.updateMorphTargets();
        if (!m.morphTargetInfluences?.length) m.morphTargetInfluences = [0];
        m.morphTargetInfluences[0] = 0;
      }
      setLoaded({ future, now });
    });
    return () => {
      alive = false;
    };
  }, [sex]);

  useEffect(() => {
    if (!loaded) return;
    (loaded.now.material as THREE.MeshBasicMaterial).color.set(color);
  }, [loaded, color]);

  return loaded;
}

/** 影の代わりの、足元のぼんやりした落ち込み。1枚の円に焼いた放射グラデ。 */
function FloorGlow({ color }: { color: string }) {
  const texture = useMemo(() => {
    const s = 256;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.45, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, GROUND + 0.002, 0]}>
      <circleGeometry args={[0.85, 48]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} color={color} />
    </mesh>
  );
}

function Body({
  fatness,
  nowFatness,
  showNow,
  sex,
  color,
  onReady,
}: {
  fatness: number;
  nowFatness: number;
  showNow: boolean;
  sex: Sex;
  color: string;
  onReady: () => void;
}) {
  const body = useBody(sex, color);

  useEffect(() => {
    if (body) onReady();
  }, [body, onReady]);

  const targets = useMemo(
    () => [
      [() => body?.future, fatness] as const,
      [() => body?.now, nowFatness] as const,
    ],
    [body, fatness, nowFatness]
  );

  /* 重みは毎フレーム目標へ寄せる。「1年後」を押したときに数字だけ飛ぶと
     別人に差し替わったように見えるので、体は必ず途中を通す。 */
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 6);
    for (const [get, target] of targets) {
      const inf = get()?.morphTargetInfluences;
      if (inf) inf[0] += (target - inf[0]) * k;
    }
  });

  /* requestAnimationFrame が動かない場面（非表示のタブ・省電力など）では
     上の補間が1回も進まない。そのままだと体が古い値のまま固まるので、
     少し遅れて最終値を入れておく。setTimeout は止まらない。 */
  useEffect(() => {
    const id = setTimeout(() => {
      for (const [get, target] of targets) {
        const inf = get()?.morphTargetInfluences;
        if (inf) inf[0] = target;
      }
    }, 600);
    return () => clearTimeout(id);
  }, [targets]);

  if (!body) return null;
  return (
    <group position={[0, GROUND, 0]}>
      <primitive object={body.future} />
      {showNow && <primitive object={body.now} />}
    </group>
  );
}

export default function BodyAvatar3D({
  bodyFatPct,
  nowBodyFatPct,
  sex,
  color = "#ad8fc6",
  height = 380,
}: {
  /** 見せたい未来の体脂肪率 */
  bodyFatPct: number;
  /** いまの体脂肪率。渡すと半透明の殻として重なる */
  nowBodyFatPct?: number;
  sex: Sex;
  color?: string;
  height?: number;
}) {
  const fatness = fatnessFromBodyFat(sex, bodyFatPct);
  const nowFatness = fatnessFromBodyFat(sex, nowBodyFatPct ?? bodyFatPct);

  // ほとんど差がないときに殻を出すと、二重線に見えるだけで何も伝わらない
  const showNow =
    nowBodyFatPct !== undefined && Math.abs(nowFatness - fatness) > 0.012;

  /* 触るまでだけゆっくり回す。3Dであることは、動いていれば説明しなくても伝わる。
     触ったあとも回り続けると、見たい角度で止められなくて邪魔になる。 */
  const [spin, setSpin] = useState(true);
  const stopSpin = useCallback(() => setSpin(false), []);

  /* 素体は800KB強あるので、読み終わるまで1秒ほど枠が空く。
     何も出さないと「壊れている」に見えるので、それまでは目印を置く。 */
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  useEffect(() => setReady(false), [sex]);

  return (
    <div style={{ height, width: "100%", position: "relative" }}>
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#6b7280",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          体を読み込んでいます…
        </div>
      )}
      <Canvas camera={{ position: [0, 0.15, 3.0], fov: 38 }} dpr={[1, 2]}>
        {/* 主光源1つ＋弱い補助＋逆光。補助を上げると陰が消えて板に見える */}
        <hemisphereLight args={["#b9c6e8", "#1a1410", 0.28]} />
        <directionalLight position={[2.4, 3.6, 3.0]} intensity={2.4} />
        <directionalLight position={[-3.2, 1.4, 1.6]} intensity={0.28} color="#9db4ff" />
        {/* 輪郭を出す逆光。体のふちが背景から離れて立体に見える */}
        <directionalLight position={[-2.2, 2.0, -3.0]} intensity={1.5} color={color} />
        <directionalLight position={[2.6, 1.2, -2.8]} intensity={0.7} color="#ffcbab" />
        <Body
          fatness={fatness}
          nowFatness={nowFatness}
          showNow={showNow}
          sex={sex}
          color={color}
          onReady={markReady}
        />
        <FloorGlow color={color} />
        <OrbitControls
          makeDefault
          enablePan={false}
          autoRotate={spin}
          autoRotateSpeed={0.6}
          onStart={stopSpin}
          minDistance={1.8}
          maxDistance={5}
          target={[0, 0.02, 0]}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.7}
        />
      </Canvas>
    </div>
  );
}
