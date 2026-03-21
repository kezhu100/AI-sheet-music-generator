import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sheet Music Generator",
  description: "Upload audio, verify transcription with lightweight preview and cleanup tools, then export MIDI or MusicXML for MuseScore handoff."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
