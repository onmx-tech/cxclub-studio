import '@/app/globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import RootLayoutShell, { defaultMetadata } from '@/components/RootLayoutShell';

// Inter powers the builder's UI. It is loaded here (not in the shared shell)
// so published public pages don't ship the builder's font.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// CX: browser <title> for the builder itself only — `defaultMetadata` stays
// untouched since it also serves as the public-site fallback in
// app/(site)/layout.tsx when a client hasn't set their own title/favicon.
export const metadata: Metadata = {
  ...defaultMetadata,
  title: 'CxClub Studio',
};

export default function BuilderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootLayoutShell lang="en" bodyClassName={`${inter.variable} font-sans antialiased text-xs`}>
      {children}
    </RootLayoutShell>
  );
}
