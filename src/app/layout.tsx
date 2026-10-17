import type { Metadata } from "next";
import { Manrope, Marck_Script } from "next/font/google";
import Link from "next/link";

import "./globals.css";

// The same fonts as on the landing
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const marckScript = Marck_Script({
  variable: "--font-marck-script",
  weight: "400",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично, и заметки о разговорах",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${marckScript.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-dashed">
          <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 lg:h-20">
            {/* The wordmark from the landing */}
            <Link
              href="/"
              className="text-logo outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring lg:text-logo-lg"
            >
              личная crm
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
