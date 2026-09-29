export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "liftwise-theme";

/**
 * Runs in <head> before the first paint so a saved Light/Dark choice never
 * flashes the wrong theme. "System" needs no script: the CSS media query
 * handles it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
