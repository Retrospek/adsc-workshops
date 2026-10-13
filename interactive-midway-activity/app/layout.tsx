import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outthink the Room",
  description: "A live game theory guessing game.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
