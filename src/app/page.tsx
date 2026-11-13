// Home route: the departure board with the network map

import { Suspense } from "react"

import BoardApp from "@/app/_components/board-app"
import { authMode } from "@/lib/auth"

// --- CONSTANTS ---

export const dynamic = "force-dynamic"

// --- COMPONENT ---

export default function Page() {
    return (
        <main>
            <h1 className="sr-only">Busbord: alle bussen en trams naar je bestemming</h1>
            <Suspense>
                <BoardApp loginEnabled={authMode() === "on"} />
            </Suspense>
        </main>
    )
}
