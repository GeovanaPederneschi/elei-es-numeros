import { TSEError } from "./tse";

export function ok(dados: unknown, sMaxAge = 120) {
  return Response.json(dados, {
    headers: {
      // CDN da Vercel guarda por s-maxage e, depois disso, ainda responde na hora com a versão
      // anterior enquanto busca a nova em segundo plano (stale-while-revalidate).
      "Cache-Control": `public, max-age=${Math.min(sMaxAge, 300)}, s-maxage=${sMaxAge}, stale-while-revalidate=604800`,
    },
  });
}

export function falha(e: unknown) {
  const status = e instanceof TSEError ? e.status : 500;
  const msg = e instanceof Error ? e.message : "Erro inesperado";
  console.error("[api]", msg);
  return Response.json({ erro: msg }, { status, headers: { "Cache-Control": "public, s-maxage=30" } });
}

export function params(req: Request) {
  return new URL(req.url).searchParams;
}

export function exigir(sp: URLSearchParams, ...nomes: string[]) {
  for (const n of nomes) if (!sp.get(n)) throw new TSEError(`Parâmetro obrigatório ausente: ${n}`, 400);
}
