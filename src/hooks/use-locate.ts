// The device's position as a place to start from, with whether it could not be found

import { useState } from "react"

import { pointId } from "@/lib/place"

// --- INTERFACES ---

interface LocatedPlace {
    id: string
    name: string
}

// --- HELPERS ---

export function useLocate(onLocated: (place: LocatedPlace) => void) {
    const [failed, setFailed] = useState(false)

    const locate = () => {
        setFailed(false)
        if (!navigator.geolocation) {
            setFailed(true)
            return
        }
        navigator.geolocation.getCurrentPosition(
            (position) =>
                onLocated({
                    id: pointId({ lat: position.coords.latitude, lon: position.coords.longitude }),
                    name: "Mijn locatie",
                }),
            () => setFailed(true),
            { enableHighAccuracy: true, timeout: 10_000 },
        )
    }

    return { locate, failed }
}
