import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { QueryProvider } from "@/lib/query-provider";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

// Inter for the interface; JetBrains Mono for the codes that run through it
// (asset, PO, GRN and component numbers) — one face on every machine instead
// of whatever monospace the OS has.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "DIGIX Asset Management",
  description: "Asset Management & Operations Management Platform",
  icons: { icon: "/favicon.svg" },
};

const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster position="top-right" richColors />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
