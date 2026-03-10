import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";



const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300','400','500','600','700'],
  variable: '--font-montserrat',
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
      <body className={`${montserrat.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
