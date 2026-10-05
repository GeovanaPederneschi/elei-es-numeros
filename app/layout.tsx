import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import AlternarTema from "@/components/AlternarTema";

export const metadata: Metadata = {
  title: "Eleições em Números",
  description: "Resultados das eleições brasileiras com dados oficiais do TSE: mapas interativos por estado, município, zona e exterior, comparações históricas e trajetória de candidatos.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b3d91" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1726" },
  ],
};

const tema = `try{var t=localStorage.getItem('tema');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: tema }} />
      </head>
      <body>
        <header className="topo">
          <div className="topo-interno">
            <Link href="/" className="marca">
              <span className="marca-icone" aria-hidden>
                ▦
              </span>
              <span>
                Eleições <b>em Números</b>
              </span>
            </Link>
            <nav className="menu" aria-label="Principal">
              <Link href="/">Mapa de resultados</Link>
              <Link href="/candidatos">Candidatos</Link>
              <Link href="/comparar">Comparar eleições</Link>
              <Link href="/historico">Histórico</Link>
            </nav>
            <AlternarTema />
          </div>
        </header>
        <main className="conteudo">{children}</main>
        <footer className="rodape">
          <p>
            Dados: <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">Tribunal Superior Eleitoral (TSE)</a> — divulgação oficial de resultados ·
            Malhas: <a href="https://servicodados.ibge.gov.br" target="_blank" rel="noreferrer">IBGE</a>. Projeto independente, sem vínculo com o TSE.
          </p>
        </footer>
      </body>
    </html>
  );
}
