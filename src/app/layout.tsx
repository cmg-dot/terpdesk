import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { GlobalProvider } from "@/context/GlobalContext";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { authOptions } from "@/lib/auth/options";
import { themeForRole } from "@/lib/theme";
import "./globals.css";
import "./themes.css";

const inter = Inter({ subsets: ["latin"] });

// The layout reads the user's session on every request, so nothing under it (including /_not-found) can be
// prerendered at build time.
export const dynamic = "force-dynamic";

// Browser and home-screen icons come from the App Router icon files next to this layout (favicon.ico, icon1.svg, icon2.png at
// 512 px, apple-icon.png): the terpDESK owl on a cream circle. Next writes their <link> tags itself; the numbers let both the SVG
// and the PNG be listed (with one name, only one of them was).
export const metadata: Metadata = {
  title: "terpDESK",
  description: "Your interpreting business. One place.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved on the server and handed to the client provider, so useSession() has data on first paint.
  const stored = await getServerSession(authOptions);
  // A login (agency or interpreter) idle past the limit is signed out: nothing of it (name, theme) reaches the page.
  const session = stored?.user?.idleExpired ? null : stored;

  return (
    <html lang="en" data-theme={themeForRole(session?.user?.role, session?.user?.theme)}>
      <body className={inter.className}>
        <SessionProvider session={session}>
          <GlobalProvider>{children}</GlobalProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
