"use client";

import { useEffect, useState } from "react";

export default function AlternarTema() {
  const [escuro, setEscuro] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setEscuro(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  if (escuro === null) return null;
  return (
    <button
      type="button"
      className="alternar-tema"
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
      onClick={() => {
        const novo = escuro ? "light" : "dark";
        document.documentElement.dataset.theme = novo;
        try {
          localStorage.setItem("tema", novo);
        } catch {}
        setEscuro(!escuro);
      }}
    >
      {escuro ? "☀" : "☾"}
    </button>
  );
}
