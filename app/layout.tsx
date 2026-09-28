import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";



/* Official app font — THICCCBOI (OFL), self-hosted from /thicccboi/fonts/Webfont */
const thicccboi = localFont({
  src: [
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Thin.woff2', weight: '100', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Light.woff2', weight: '300', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-ExtraBold.woff2', weight: '800', style: 'normal' },
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-Black.woff2', weight: '900', style: 'normal' },
    // "Heavy" per the font README
    { path: '../thicccboi/fonts/Webfont/THICCCBOI-ThicccAF.woff2', weight: '950', style: 'normal' },
  ],
  // Metrics-matched fallback so text doesn't jump while the font loads
  adjustFontFallback: 'Arial',
  variable: '--font-thicccboi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Youtask by Projective Staffing",
  description: "AI Task ManagerAgent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${thicccboi.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
