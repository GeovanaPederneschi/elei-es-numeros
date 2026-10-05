import { ok, falha, params, exigir } from "@/lib/api";
import { distribuicao, obterEleicao, ttlPara } from "@/lib/tse";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele", "cargo", "uf");
    const ele = sp.get("ele")!;
    const d = await distribuicao(ele, +sp.get("cargo")!, sp.get("uf")!, sp.get("mun") || undefined, {
      nivel: sp.get("nivel") === "mun" ? "mun" : undefined,
      top: sp.get("top") ? +sp.get("top")! : undefined,
      manter: sp.get("n") ? sp.get("n")!.split(",") : undefined,
    });
    return ok(d, ttlPara(await obterEleicao(ele)));
  } catch (e) {
    return falha(e);
  }
}
