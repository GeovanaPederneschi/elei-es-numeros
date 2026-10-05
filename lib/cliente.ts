"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<any>>();

// Cópia local (localStorage) das respostas, para reabrir a página na hora.
const LOCAL_TTL = 10 * 60_000;
const PREFIXO = "een:";

function lerLocal(url: string): any | undefined {
  try {
    const bruto = localStorage.getItem(PREFIXO + url);
    if (!bruto) return undefined;
    const { t, v } = JSON.parse(bruto);
    if (Date.now() - t > LOCAL_TTL) return undefined;
    return v;
  } catch {
    return undefined;
  }
}

function gravarLocal(url: string, v: unknown) {
  try {
    const txt = JSON.stringify({ t: Date.now(), v });
    if (txt.length > 1_500_000) return;
    try {
      localStorage.setItem(PREFIXO + url, txt);
    } catch {
      // cheio: apaga as entradas mais antigas deste site e tenta de novo
      const chaves = Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO));
      chaves
        .map((k) => ({ k, t: JSON.parse(localStorage.getItem(k) || "{}").t ?? 0 }))
        .sort((a, b) => a.t - b.t)
        .slice(0, Math.ceil(chaves.length / 2))
        .forEach(({ k }) => localStorage.removeItem(k));
      localStorage.setItem(PREFIXO + url, txt);
    }
  } catch {}
}

export function buscar<T = any>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const local = typeof window !== "undefined" ? lerLocal(url) : undefined;
    if (local !== undefined) {
      cache.set(url, Promise.resolve(local));
      return cache.get(url)!;
    }
    const p = fetch(url).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
      if (url.startsWith("/api/") && !url.startsWith("/api/malha")) gravarLocal(url, j);
      return j;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url)!;
}

export function useApi<T = any>(url: string | null | undefined) {
  const [estado, setEstado] = useState<{ dados?: T; erro?: string; carregando: boolean; url?: string }>({ carregando: !!url });
  useEffect(() => {
    if (!url) {
      setEstado({ carregando: false });
      return;
    }
    let vivo = true;
    setEstado((s) => ({ dados: s.url === url ? s.dados : undefined, carregando: true, url }));
    buscar<T>(url)
      .then((dados) => vivo && setEstado({ dados, carregando: false, url }))
      .catch((e) => vivo && setEstado({ erro: e.message, carregando: false, url }));
    return () => {
      vivo = false;
    };
  }, [url]);
  return estado;
}

export function qs(obj: Record<string, string | number | undefined | null | false>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
}

/**
 * Distribuição de votos. O mapa "Brasil por município" é montado no navegador com
 * 27 pedidos (um por estado), para cada função do servidor ficar dentro do tempo limite.
 */
export function useDistribuicao<T = any>(p: Record<string, string | number | undefined | null | false> | null) {
  const chave = p ? qs(p) : null;
  const [estado, setEstado] = useState<{ dados?: T; erro?: string; carregando: boolean; chave?: string | null }>({ carregando: !!p });
  useEffect(() => {
    if (!p || !chave) {
      setEstado({ carregando: false });
      return;
    }
    let vivo = true;
    setEstado((s) => ({ dados: s.chave === chave ? s.dados : undefined, carregando: true, chave }));
    let promessa: Promise<any>;
    if (String(p.uf).toLowerCase() === "br" && p.nivel === "mun") {
      const ufs = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"];
      promessa = Promise.all(
        ufs.map((uf) => buscar(`/api/distribuicao?${qs({ ...p, uf, nivel: undefined })}`).catch(() => null))
      ).then((partes) => {
        const ok = partes.filter(Boolean) as any[];
        if (!ok.length) throw new Error("Não foi possível carregar os municípios.");
        const comCand = ok.find((d) => d.candidatos?.length) ?? ok[0];
        return { ...comCand, uf: "br", nivel: "mun", areas: ok.flatMap((d) => d.areas ?? []), aviso: undefined };
      });
    } else promessa = buscar(`/api/distribuicao?${chave}`);
    promessa
      .then((dados) => vivo && setEstado({ dados, carregando: false, chave }))
      .catch((e) => vivo && setEstado({ erro: e.message, carregando: false, chave }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}
