"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<any>>();

export function buscar<T = any>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
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
