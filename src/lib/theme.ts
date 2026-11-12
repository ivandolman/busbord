/** Light/dark choice per device ("auto" follows the system); see useTheme and globals.css. */
export type Theme = "auto" | "light" | "dark";

export const THEME_KEY = "bestemmingsbord-theme";

/**
 * Runs in <head> before the first paint (layout.tsx), so a device set to "Donker" never flashes
 * light. A string, because it runs before any bundle has loaded.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
