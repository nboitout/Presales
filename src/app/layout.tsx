import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forward Deployed Advisor — AI-Guided Technical Walkthroughs",
  description:
    "Turn your decks into interactive AI-guided walkthroughs. An AI advisor presents your slides to executives, asks discovery questions, and surfaces fit signals.",
  openGraph: {
    title: "Forward Deployed Advisor — AI-Guided Technical Walkthroughs",
    description:
      "AI advisor that presents your slides, discovers priorities, and qualifies fit.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
