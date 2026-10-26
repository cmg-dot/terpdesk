import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { GlobalProvider } from "@/context/GlobalContext";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { authOptions } from "@/lib/auth/options";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// The layout reads the user's session on every request, so nothing under it (including /_not-found) can be
// prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "terpDESK",
  description: "Your interpreting business. One place.",
  icons: {
    icon: { url: "/terpdesk-mark.png", type: "image/png" },
    apple: "/terpdesk-mark.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved on the server and handed to the client provider, so useSession() has data on first paint.
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider session={session}>
          <GlobalProvider>{children}</GlobalProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
