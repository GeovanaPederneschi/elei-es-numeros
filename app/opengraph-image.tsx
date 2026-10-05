import { ImageResponse } from "next/og";

export const alt = "Eleições em Números — resultados e mapas das eleições no Brasil";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Imagem() {
  const barras = [
    ["#d7261e", 0.82],
    ["#1f3f8c", 0.74],
    ["#2e8b57", 0.3],
    ["#f07b1d", 0.18],
  ] as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b3d91", color: "#fff", padding: 72, flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#ffd23f" }} />
          <div style={{ fontSize: 44, fontWeight: 800 }}>Eleições em Números</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>Resultados e mapas das eleições no Brasil</div>
          <div style={{ fontSize: 30, opacity: 0.85 }}>Por estado, município, zona eleitoral e exterior · dados oficiais do TSE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {barras.map(([cor, l]) => (
            <div key={cor} style={{ height: 22, width: `${l * 100}%`, background: cor, borderRadius: 11 }} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
