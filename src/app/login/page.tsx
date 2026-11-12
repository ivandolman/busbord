import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authMode, safeNextPath, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inloggen · Bestemmingsbord", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  "1": "Dat wachtwoord klopt niet.",
  wait: "Te vaak een verkeerd wachtwoord. Probeer het over een kwartier opnieuw.",
};

/** A plain HTML form: works before any script has loaded, and with a password manager. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const next = safeNextPath(one("next"));

  if (authMode() !== "on" || verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value) !== null) redirect(next);

  const error = MESSAGES[one("error") ?? ""];
  return (
    <main className="flex min-h-dvh items-center justify-center bg-oppervlak px-4 py-10">
      <form method="post" action="/api/login" className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-achtergrond p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
        <h1 className="text-kop-xl">Bestemmingsbord</h1>
        <p className="text-body-m text-tekst-zacht">
          {one("out") ? "Je bent uitgelogd." : "Log in om het vertrekbord en je routes te zien."}
        </p>
        <input type="hidden" name="next" value={next} />
        {/* A username field (hidden) lets password managers file the password under this site. */}
        <input type="text" name="username" autoComplete="username" value="bestemmingsbord" readOnly hidden />
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
            className="h-12 rounded-xl border-2 border-transparent bg-oppervlak px-3 text-body-m focus:border-accent focus:bg-achtergrond focus:outline-none"
          />
        </label>
        {error && (
          <p id="login-error" role="alert" className="text-body-s font-semibold text-fout">
            {error}
          </p>
        )}
        <button type="submit" className="h-12 rounded-xl bg-accent text-body-m font-semibold text-op-donker hover:opacity-90">
          Inloggen
        </button>
      </form>
    </main>
  );
}
