import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Steam Game Finder",
  description:
    "Find games your friend group can play together. Compare Steam libraries and discover shared games.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-slate-900 text-slate-200 antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-700 px-6 py-4 text-xs text-slate-500 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>
            <a
              href="https://store.steampowered.com"
              className="text-blue-400 hover:underline"
            >
              Powered by the Steam Web API
            </a>
            {" — "}not affiliated with or endorsed by Valve Corporation.
            Game data provided as-is.
          </span>
          <a href="/privacy" className="hover:underline hover:text-slate-300">
            Privacy Policy
          </a>
        </footer>
      </body>
    </html>
  );
}
