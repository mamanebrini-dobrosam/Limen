/**
 * Official room choices selected by the owner on the marked reference.
 * Colors and logo crops come ONLY from the unmarked 1536 x 1024 original.
 * Rows/columns are one-based. Existing room theme IDs remain readable.
 */
export const ROOM_PALETTES = [
  { id: "smaragd", label: "Duboki smaragd", row: 1, column: 2, start: "#062d23", end: "#021d15", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "petrol", label: "Petrol zelena", row: 1, column: 3, start: "#034537", end: "#024033", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "slonovaca", label: "Topla slonovača", row: 1, column: 5, start: "#e9deca", end: "#ddd0b9", foreground: "#062d23", tone: "light", shade: 0 },
  { id: "grafit", label: "Grafit i menta", row: 2, column: 2, start: "#2d3033", end: "#202327", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "suma", label: "Šumska zelena", row: 2, column: 3, start: "#294826", end: "#1f3d1e", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "ponoc", label: "Ponoćno plava", row: 3, column: 1, start: "#06274c", end: "#021d3e", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "koralj", label: "Koraljni suton", row: 3, column: 2, start: "#fbbbad", end: "#f9b1a2", foreground: "#062d23", tone: "light", shade: 0 },
  { id: "bakar", label: "Bakrena narandža", row: 3, column: 4, start: "#c85c19", end: "#b64b12", foreground: "#fff9e8", tone: "dark", shade: 0.18 },
  { id: "rubin", label: "Rubin crvena", row: 3, column: 5, start: "#aa2428", end: "#8d1216", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "sunce", label: "Sunčano zlato", row: 4, column: 1, start: "#fdd76d", end: "#f2ba3d", foreground: "#062d23", tone: "light", shade: 0 },
  { id: "ametist", label: "Ametist", row: 4, column: 4, start: "#3a214e", end: "#381e4b", foreground: "#fff9e8", tone: "dark", shade: 0 },
  { id: "obsidijan", label: "Zeleni obsidijan", row: 4, column: 5, start: "#050403", end: "#030302", foreground: "#fff9e8", tone: "dark", shade: 0 },
] as const;

export type RoomPalette = typeof ROOM_PALETTES[number];
export const LEGACY_ROOM_THEME_IDS = ["orah", "kadulja", "noc", "krem"] as const;
export const ROOM_THEME_IDS = [...LEGACY_ROOM_THEME_IDS, ...ROOM_PALETTES.map((p) => p.id)] as const;

export function roomPalette(id: string) {
  return ROOM_PALETTES.find((p) => p.id === id);
}

export function paletteLogo(palette: RoomPalette) {
  return `/__mockup/images/limen/${palette.id}.png`;
}

/** A small copper-only darkening keeps normal-size cream text above WCAG AA. */
export function effectivePaletteColor(hex: string, shade: number): string {
  return "#" + hex.slice(1).match(/.{2}/g)!.map((c) =>
    Math.round(parseInt(c, 16) * (1 - shade)).toString(16).padStart(2, "0"),
  ).join("");
}

export function paletteBackground(palette: RoomPalette) {
  return `linear-gradient(145deg, ${effectivePaletteColor(palette.start, palette.shade)}, ${effectivePaletteColor(palette.end, palette.shade)})`;
}
