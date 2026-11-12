// Login route: a plain password form in front of the board

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { authMode, safeNextPath, SESSION_COOKIE, verifySessionToken } from "@/lib/auth"
import { buildMetadata } from "@/lib/seo/metadata"

// --- CONSTANTS ---

export const dynamic = "force-dynamic"

const MESSAGES: Record<string, string> = {
    "1": "Dat wachtwoord klopt niet.",
    wait: "Te vaak een verkeerd wachtwoord. Probeer het over een kwartier opnieuw.",
}

// --- INTERFACES ---

interface LoginPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

// --- METADATA ---

export const metadata = buildMetadata({ title: "Inloggen · Bestemmingsbord", noindex: true })

// --- COMPONENT ---

/** A plain HTML form: works before any script has loaded, and with a password manager. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
    const params = await searchParams
    const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined)
    const next = safeNextPath(one("next"))

    if (
        authMode() !== "on" ||
        verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value) !== null
    )
        redirect(next)

    const error = MESSAGES[one("error") ?? ""]
    return (
        <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-10">
            <form
                method="post"
                action="/api/login"
                className="bg-background flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
            >
                <h1 className="text-heading-xl">Bestemmingsbord</h1>
                <p className="text-body-m text-muted">
                    {one("out")
                        ? "Je bent uitgelogd."
                        : "Log in om het vertrekbord en je routes te zien."}
                </p>
                <input type="hidden" name="next" value={next} />
                {/* A username field (hidden) lets password managers file the password under this site. */}
                <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value="bestemmingsbord"
                    readOnly
                    hidden
                />
                <label className="flex flex-col gap-1.5">
                    <span className="text-body-m font-semibold">Wachtwoord</span>
                    <input
                        type="password"
                        name="password"
                        required
                        autoFocus
                        autoComplete="current-password"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? "login-error" : undefined}
                        className="bg-surface text-body-m focus:border-accent focus:bg-background h-12 rounded-xl border-2 border-transparent px-3 focus:outline-none"
                    />
                </label>
                {error && (
                    <p
                        id="login-error"
                        role="alert"
                        className="text-body-s text-error font-semibold"
                    >
                        {error}
                    </p>
                )}
                <button
                    type="submit"
                    className="bg-accent text-body-m text-on-dark h-12 rounded-xl font-semibold hover:opacity-90"
                >
                    Inloggen
                </button>
            </form>
        </main>
    )
}
