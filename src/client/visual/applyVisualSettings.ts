import { visualSettings } from "./settings";
import { createVisualCssText } from "./tokens";

let resizeHandler: (() => void) | null = null;

export function applyVisualSettings(settings = visualSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let style = document.getElementById("limen-visual-settings") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "limen-visual-settings";
    document.head.append(style);
  }
  style.textContent = createVisualCssText(settings);

  document.title = settings.brand.title;
  const fontStylesheet = document.querySelector<HTMLLinkElement>('link[href^="https://fonts.googleapis.com/css2?family="]');
  if (fontStylesheet) fontStylesheet.href = settings.font.googleStylesheet;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = settings.palette.night;
  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.append(favicon);
  }
  favicon.href = settings.brand.favicon;

  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  resizeHandler = () => {
    root.dataset.limenLayout = window.innerWidth <= settings.layout.mobileBreakpoint ? "mobile" : "desktop";
  };
  resizeHandler();
  window.addEventListener("resize", resizeHandler, { passive: true });
}
