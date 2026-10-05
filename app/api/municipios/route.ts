import { ok, falha, params, exigir } from "@/lib/api";
import { municipiosCache } from "@/lib/cache";

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele");
    const todos = await municipiosCache(sp.get("ele")!);
    const uf = sp.get("uf")?.toLowerCase();
    return ok(uf ? { [uf]: todos[uf] ?? [] } : todos, 86400);
  } catch (e) {
    return falha(e);
  }
}
