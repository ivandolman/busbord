// Root layout: fonts, theme script, global styles and the app-wide client helpers

import type { ReactNode } from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import ServiceWorker from "@/components/app/service-worker"
import SessionGuard from "@/components/app/session-guard"
import { buildMetadata } from "@/lib/seo/metadata"
import { THEME_SCRIPT } from "@/lib/theme"

import "@/styles/globals.css"

// --- CONSTANTS ---

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

// --- INTERFACES ---

interface RootLayoutProps {
    children: ReactNode
}

// --- METADATA ---

export const metadata: Metadata = buildMetadata({
    title: "Busbord",
    description: "Alle bussen en trams naar jouw bestemming op één vertrekbord.",
})

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#161a21" },
    ],
}

// --- COMPONENT ---

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        // data-theme is set by THEME_SCRIPT before React hydrates, hence suppressHydrationWarning.
        <html lang="nl" className={inter.variable} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body className="bg-background text-foreground min-h-dvh overscroll-none font-sans antialiased">
                {children}
                <ServiceWorker />
                <SessionGuard />
            </body>
        </html>
    )
}
