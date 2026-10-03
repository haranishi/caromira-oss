"""CC0の人体素体に「太り」のシェイプキーを付けて .glb で書き出す（男女ぶん）。

素体: Blender Studio Human Base Meshes Bundle v1.0.0（CC0）の
GEO-body_male_realistic / GEO-body_female_realistic。

## なぜこの作りなのか

太り方を「体の中心から一様に拡大」でやると、背中も腹と同じだけ膨らんで
シルエットが樽になる。実物は腹が前に出て脇に浮き輪が乗り、腿と二の腕が太くなる。
見た人が「痩せた／太った」を読み取るのはこの前後差なので、
横（x）・前（y+）・後ろ（y-）で倍率を変え、腕と脚は胴と別扱いにしている。

## 手順

1. 面を1/10に間引く（シェイプキーと Decimate は同居できないので必ず先）
2. 足裏を原点・身長1.75へ正規化
3. 高さで輪切りにし、メッシュのつながりで「左腕／左脚／胴／右脚／右腕」に分ける
   ⚠️ 「x が◯cm空いたら別の部位」で分けてはいけない。間引いた後は胴の中にも
   3cmの間が普通にでき、胸の段が8個に割れた。つながりで見れば1本の輪になる。
4. かたまりごとに中心から膨らませる。胴だけ前後で倍率を変える
5. 「膨らませる量」と「かたまりの中心」をメッシュのつながりに沿ってならす
   （輪切りの分け方は隣の段で急に変わるので、そのままだと段差と折れ目になる）
   ⚠️ 移動ベクトルそのものをならすと消える。筒の左右で向きが逆＝平均が0に近づくため。
   実際に8回ならしたら腿の太りが1/7になった。ならすのは向きを持たない量だけ。
6. シェイプキー `fat` として焼き、既定の重みは 0（＝痩せている側）で書き出す

体つきの男女差は「どこに脂肪が乗るか」で表す。男は腹、女は腰と腿を厚めにした。
"""
import sys
import bpy
from mathutils import Vector

SRC = '/tmp/basemesh/human_base_meshes_bundle.blend'
OUT_DIR = '/tmp/basemesh'
TARGET_HEIGHT = 1.75
TARGET_VERTS = 14000  # PWAに載せるので頂点数で狙う（素体ごとに細かさが違う）
SLICES = 64          # 輪切りの段数（薄すぎると輪が切れて部位が割れる。実測で64が安定）
SMOOTH_ITERS = 10    # ならす回数（移動量そのものではなく、下の「量と軸」をならす）

# 体つきの男女差。数字は「シェイプキー最大のときの倍率」
PRESET = {
    'male': {
        'mesh': 'GEO-body_male_realistic',
        'core_side': 0.30, 'core_front': 0.74, 'core_back': 0.12, 'core_shift': 0.24,
        'arm': 0.34, 'leg': 0.30,
        'core': [(0.00,0.00),(0.14,0.00),(0.30,0.05),(0.44,0.20),(0.50,0.42),
                 (0.56,0.78),(0.61,1.00),(0.66,0.92),(0.72,0.60),(0.78,0.34),
                 (0.83,0.18),(0.87,0.13),(0.92,0.03),(1.00,0.00)],
    },
    'female': {
        'mesh': 'GEO-body_female_realistic',
        'core_side': 0.36, 'core_front': 0.56, 'core_back': 0.16, 'core_shift': 0.14,
        'arm': 0.34, 'leg': 0.46,
        'core': [(0.00,0.00),(0.14,0.00),(0.30,0.06),(0.44,0.26),(0.50,0.56),
                 (0.56,0.86),(0.60,1.00),(0.65,0.88),(0.72,0.52),(0.78,0.28),
                 (0.83,0.16),(0.87,0.11),(0.92,0.03),(1.00,0.00)],
    },
}

# へそから上は横に広げない。胸や肩まで横に太らせると、太った人ではなく
# 「がっしりした人」に見えてしまう（実際そうなって作り直した）。
SIDE_TAPER = [(0.00,1.00),(0.64,1.00),(0.72,0.66),(0.80,0.40),(1.00,0.40)]

# 腕は二の腕、脚は腿がいちばん太る。手と足は動かさない
ARM = [(0.00,0.00),(0.52,0.00),(0.58,0.16),(0.64,0.44),(0.70,0.62),
       (0.75,0.55),(0.79,0.30),(0.83,0.06),(0.87,0.00),(1.00,0.00)]
LEG = [(0.00,0.00),(0.10,0.00),(0.16,0.10),(0.24,0.30),(0.32,0.52),
       (0.38,0.62),(0.43,0.55),(0.47,0.30),(0.51,0.05),(0.56,0.00),(1.00,0.00)]


def curve(pts, h):
    """制御点の折れ線を線形につなぐ。"""
    if h <= pts[0][0]:
        return pts[0][1]
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        if x0 <= h <= x1:
            t = (h - x0) / (x1 - x0) if x1 > x0 else 0.0
            return y0 + (y1 - y0) * t
    return pts[-1][1]


def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(SRC, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == name]
    obj = next(o for o in dst.objects if o and o.type == 'MESH')
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print('SKIP', m.name, e)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # 素体によってサブディビジョンの段数が違い（男1段・女3段）、
    # 同じ ratio だと出来上がりの重さが10倍ずれる。頂点数で狙う。
    dec = obj.modifiers.new('dec', 'DECIMATE')
    dec.ratio = min(1.0, TARGET_VERTS / max(1, len(obj.data.vertices)))
    bpy.ops.object.modifier_apply(modifier='dec')
    return obj


def normalize(me):
    co = [v.co for v in me.vertices]
    z0 = min(c.z for c in co)
    z1 = max(c.z for c in co)
    cx = (min(c.x for c in co) + max(c.x for c in co)) / 2
    cy = (min(c.y for c in co) + max(c.y for c in co)) / 2
    s = TARGET_HEIGHT / (z1 - z0)
    for v in me.vertices:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - z0) * s))


def front_sign(me):
    """つま先が出ている向きを前とする。"""
    foot = [v.co for v in me.vertices if v.co.z < 0.06 * TARGET_HEIGHT]
    cy = sum(c.y for c in foot) / len(foot)
    return 1.0 if (max(c.y for c in foot) - cy) > (cy - min(c.y for c in foot)) else -1.0


def parts(members, nbr, window):
    """輪切りの中を、メッシュのつながりでかたまりに分ける。

    つながりは前後の段もたどる（window）。1段だけだと、面が斜めのところで
    輪が切れて同じ部位が2つに割れるため。返すのは members だけの並び。
    """
    seen = set()
    out = []
    wanted = set(members)
    for start in members:
        if start in seen:
            continue
        seen.add(start)
        stack = [start]
        comp = []
        while stack:
            v = stack.pop()
            if v in wanted:
                comp.append(v)
            for w in nbr[v]:
                if w in window and w not in seen:
                    seen.add(w)
                    stack.append(w)
        if comp:
            out.append(comp)
    return out


def build(sex):
    p = PRESET[sex]
    obj = load(p['mesh'])
    me = obj.data
    normalize(me)
    fs = front_sign(me)
    co = [v.co.copy() for v in me.vertices]
    n = len(co)
    print(f'[{sex}] VERTS {n} TRIS {sum(len(f.vertices) - 2 for f in me.polygons)} FRONT {fs:+.0f}')

    # --- 輪切りごとに、かたまりへ分けて移動量を出す ---
    band = [min(SLICES - 1, int(c.z / TARGET_HEIGHT * SLICES)) for c in co]
    bands = [[] for _ in range(SLICES)]
    for i, b in enumerate(band):
        bands[b].append(i)

    nbr = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)

    # 頂点ごとに「膨らませる量・かたまりの中心・胴らしさ」を持たせる
    amt = [0.0] * n
    side = [1.0] * n
    ax = [0.0] * n
    ay = [0.0] * n
    half = [0.0] * n
    core_w = [0.0] * n
    for b, members in enumerate(bands):
        if len(members) < 4:
            continue
        h = (b + 0.5) / SLICES
        window = set(members)
        for d in (-1, 1):
            if 0 <= b + d < SLICES:
                window.update(bands[b + d])
        ranked = []
        for ids in parts(members, nbr, window):
            gx = [co[i].x for i in ids]
            gy = [co[i].y for i in ids]
            ranked.append({
                'ids': ids,
                'cx': (min(gx) + max(gx)) / 2,
                'cy': (min(gy) + max(gy)) / 2,
                'half_y': max(1e-4, (max(gy) - min(gy)) / 2),
                'core': min(gx) <= 0.0 <= max(gx),
            })
        limbs = sorted([g for g in ranked if not g['core']], key=lambda g: -abs(g['cx']))
        arm_ids = {id(g) for g in limbs[:2]} if len(limbs) >= 3 else set()
        for g in ranked:
            if g['core']:
                a = curve(p['core'], h)
                w = 1.0
                taper = curve(SIDE_TAPER, h)
            else:
                is_arm = id(g) in arm_ids or (len(limbs) <= 2 and h > 0.55)
                a = curve(ARM, h) * p['arm'] if is_arm else curve(LEG, h) * p['leg']
                w = 0.0
                taper = 1.0
            for i in g['ids']:
                amt[i] = a
                side[i] = taper
                ax[i] = g['cx']
                ay[i] = g['cy']
                half[i] = g['half_y']
                core_w[i] = w

    # --- 量と軸をならす（向きを持たない値なので、ならしても消えない） ---
    def relax(field):
        cur = field
        for _ in range(SMOOTH_ITERS):
            nxt = []
            for i in range(n):
                if not nbr[i]:
                    nxt.append(cur[i])
                    continue
                s = 0.0
                for j in nbr[i]:
                    s += cur[j]
                nxt.append(cur[i] * 0.30 + (s / len(nbr[i])) * 0.70)
            cur = nxt
        return cur

    amt, side, ax, ay, half, core_w = (relax(f) for f in (amt, side, ax, ay, half, core_w))

    # --- 胴のやり方と手足のやり方を、胴らしさで混ぜる ---
    delta = []
    for i in range(n):
        dx = co[i].x - ax[i]
        dy = co[i].y - ay[i]
        k = p['core_front'] if (dy * fs) > 0 else p['core_back']
        cw = core_w[i]
        gx = dx * amt[i] * (p['core_side'] * side[i] * cw + (1 - cw))
        gy = dy * amt[i] * (k * cw + (1 - cw)) + fs * p['core_shift'] * amt[i] * half[i] * cw
        delta.append(Vector((gx, gy, 0.0)))

    # --- シェイプキーへ焼く。既定の重みは0（＝痩せている側から始める） ---
    obj.shape_key_add(name='Basis', from_mix=False)
    fat = obj.shape_key_add(name='fat', from_mix=False)
    for i in range(n):
        fat.data[i].co = co[i] + delta[i]
    fat.value = 0.0
    obj.data.shape_keys.key_blocks['fat'].slider_min = 0.0

    def span(pts, z, axis, tol=0.02):
        # 腕が同じ高さに来るので、胴（中心から25cm以内）だけを測る
        sel = [c for c in pts if abs(c.z - z) < tol and abs(c.x) < 0.25]
        if not sel:
            return 0.0
        vals = [getattr(c, axis) for c in sel]
        return max(vals) - min(vals)

    fatco = [fat.data[i].co for i in range(n)]
    for label, z in (('腿', 0.66), ('腰', 0.93), ('腹', 1.06), ('胸', 1.26)):
        print(f'[{sex}] {label} z={z}  幅 {span(co,z,"x"):.3f}→{span(fatco,z,"x"):.3f}'
              f'  厚み {span(co,z,"y"):.3f}→{span(fatco,z,"y"):.3f}')

    out = f'{OUT_DIR}/body-{sex}.glb'
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # 間引いたままだと面が1枚ずつ平らに見える（体が多面体に見えて安っぽい）
    bpy.ops.object.shade_smooth()
    # マテリアルとUVは使わない（色は画面側で作る）。付けたままだと元の
    # テクスチャが .glb に埋まって数MB増える
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_morph=True, export_apply=False, export_yup=True,
                              export_materials='NONE', export_texcoords=False)
    print(f'[{sex}] WROTE {out}')


for sex in (sys.argv[-1].split(',') if '--sex' in sys.argv else ('male', 'female')):
    build(sex)
