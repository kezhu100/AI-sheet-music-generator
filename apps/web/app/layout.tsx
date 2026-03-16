import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sheet Music Generator",
  description: "Upload audio, create a processing job, and preview mocked piano and drum note events."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

