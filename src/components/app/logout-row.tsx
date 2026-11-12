// "Uitloggen" row in the settings: clears this device's offline copies, then ends the session

"use client"

// --- COMPONENT ---

export default function LogoutRow() {
    return (
        <form
            method="post"
            action="/api/logout"
            onSubmit={() => {
                // Best effort; the form submits either way. Saved routes must not stay readable offline.
                if ("caches" in window)
                    void caches
                        .keys()
                        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            }}
        >
            <button
                type="submit"
                className="border-border flex min-h-14 w-full items-center justify-between gap-3 border-b py-2.5 text-left"
            >
                <span>
                    <span className="text-body-m block font-semibold">Uitloggen</span>
                    <span className="text-body-s text-muted block">Op dit apparaat</span>
                </span>
            </button>
        </form>
    )
}
