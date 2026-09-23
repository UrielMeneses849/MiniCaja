import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "MiniCaja",
  description: "Ventas, movimientos y cierre de caja desde tu teléfono.",
  applicationName: "MiniCaja",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MiniCaja" },
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
    apple: `${basePath}/favicon.svg`,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f5137",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} antialiased`}><RegisterServiceWorker />{children}</body>
    </html>
  );
}
