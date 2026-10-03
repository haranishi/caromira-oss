# 素体の出どころ

`body-male.glb` / `body-female.glb` は Blender Studio の
**Human Base Meshes Bundle v1.0.0** に含まれる `GEO-body_male_realistic` /
`GEO-body_female_realistic` を加工したもの。

- 配布元: https://archive.org/details/human-base-meshes-bundle-v1.0.0
- 公式のバンドル案内と条件: https://www.blender.org/download/demo-files/ （Human Base Meshes は CC0）
- 制作者による配布方針: https://devtalk.blender.org/t/asset-bundle-base-meshes/21535
- ライセンス: **CC0 1.0（パブリックドメイン）** https://creativecommons.org/publicdomain/zero/1.0/
- 加工手順: `tools/build-body.py`（Blenderで実行すれば同じものが再生成できる）
  - 面を間引いて各14,001頂点・27,998三角形にした
  - 足裏を原点に、身長1.75へ正規化。左右・前後の中心を原点にそろえた
  - 「fat」シェイプキーを1本追加。腹は前へ出し、脇と腰と腿を横へ広げ、
    背中・頭・手足はほぼ動かさない。既定の重みは0（＝痩せている側）
  - なめらかシェーディングにし、マテリアルとUVは落とした（色は画面側で作る）
  - glTF（GLB・Y-up・モーフ書き出しあり・各約820KB）

CC0なので表示義務はないが、出どころを残しておく。リポジトリ直下のMITライセンスは、この第三者モデルの権利条件を置き換えない。
