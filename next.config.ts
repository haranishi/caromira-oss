import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 全ページがクライアント側だけで動くので静的書き出しにする。
     Cloudflare Pages にそのまま置けて、サーバーを持たなくて済む。 */
  output: "export",
};

export default nextConfig;
