import { ok, falha, params, exigir } from "@/lib/api";
import { municipios } from "@/lib/tse";

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele");
    const todos = await municipios(sp.get("ele")!);
    const uf = sp.get("uf")?.toLowerCase();
    return ok(uf ? { [uf]: todos[uf] ?? [] } : todos, 86400);
  } catch (e) {
    return falha(e);
  }
}
