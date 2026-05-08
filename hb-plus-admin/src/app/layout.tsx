import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HB+ Admin Control Tower | 21-Day Habit Challenge",
  description: "Premium wellness brand admin dashboard for managing 21-Day Habit Challenges.",
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Placeholder for real brand fonts - would normally use next/font/google or localFont */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ minHeight: '100vh', width: '100%', margin: 0, padding: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
