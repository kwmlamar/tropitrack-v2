import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { InstallPrompt } from "@/components/mobile/install-prompt";

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
  title: "TropiTrack - Construction Management",
  description: "Construction project management, time tracking, and payroll for Caribbean businesses",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TropiTrack",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  openGraph: {
    title: "TropiTrack - Construction Management",
    description: "Construction project management, time tracking, and payroll for Caribbean businesses",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "TropiTrack Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TropiTrack - Construction Management",
    description: "Construction project management, time tracking, and payroll for Caribbean businesses",
    images: ["/icons/icon-512x512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#3B82F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
