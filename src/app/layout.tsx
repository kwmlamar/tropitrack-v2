import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

// Get the base URL from environment or use a default
const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://tropitrack-v2.vercel.app";
};

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "TropiTrack v2 - Construction Project Management",
  description: "Complete construction project management system for Bahamian construction companies",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "TropiTrack v2 - Construction Project Management",
    description: "Complete construction project management system for Bahamian construction companies",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "TropiTrack v2 Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TropiTrack v2 - Construction Project Management",
    description: "Complete construction project management system for Bahamian construction companies",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="system" storageKey="tropitrack-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
