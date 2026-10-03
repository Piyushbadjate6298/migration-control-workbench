import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Migration Control | Data Migration Workbench",
  description:
    "Plan, validate, execute, reconcile, and roll back a bounded data migration with human approval.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
