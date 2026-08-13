import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VaultDrive Admin — Zero-Trust Airlock Dashboard",
  description:
    "Offline administration dashboard for VaultDrive: generate master keys, provision USB edge-agents, and manage threat intelligence for air-gapped banking systems.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-black text-slate-200 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
