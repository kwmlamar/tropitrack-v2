import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Source_Code_Pro, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorMeta } from "@/components/theme-color-meta";

// UI face. Variable, so the 450 body weight set in globals.css renders as a real
// optical weight rather than a synthesized one. (Supabase Studio itself uses Inter;
// we run a warmer humanist sans here by preference.)
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Supabase's mono, used here for the uppercase micro-labels and numerics.
const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

// Display serif for client-facing document surfaces (estimate preview, invoices, etc.)
// Fraunces — warm, optical-sized; gives the company wordmark a Caribbean-print-shop feel
// rather than corporate-bank.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
});

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
  title: "Bedrock — ODS Management",
  description: "Business OS for ODS Management. Jobs, crew, payroll, and goals — all in one place.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bedrock",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  openGraph: {
    title: "Bedrock — ODS Management",
    description: "Business OS for ODS Management.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f7" }, // light canvas
    { media: "(prefers-color-scheme: dark)", color: "#141414" }, // dark canvas
  ],
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
      <body className={`${plusJakartaSans.variable} ${sourceCodePro.variable} ${fraunces.variable} font-sans`}>
        <ThemeProvider defaultTheme="dark" storageKey="bedrock-theme">
          <ThemeColorMeta />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
