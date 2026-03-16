import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sheet Music Generator",
  description: "Upload audio, preview piano and drum draft notation, make simple edits, and export MIDI or MusicXML."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
