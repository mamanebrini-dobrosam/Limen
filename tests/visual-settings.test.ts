import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Brand } from "../src/client/visual/Brand";
import { Shell } from "../src/client/shell";
import { visualSettings } from "../src/client/visual/settings";
import { createVisualCssText, createVisualCssVariables } from "../src/client/visual/tokens";
import { ROOM_PALETTES, paletteBackground } from "../src/shared/room-palettes";
import { PaletteReview } from "../src/client/pages/PaletteReview";
import { RoomEditor } from "../src/client/pages/RoomEditor";

describe("LIMEN visual settings", () => {
  it("uses the approved Private Salon neutrals with unchanged source-image branding", () => {
    expect(visualSettings.palette).toMatchObject({
      primary: "#355c4b",
      primaryDark: "#294a3b",
      background: "#f2eee5",
      backgroundSecondary: "#e7e0d3",
      night: "#062d23",
      nightDark: "#021d15",
      text: "#253a32",
      mutedText: "#59675f",
      surface: "#fbf9f3",
      panel: "#f5f1e8",
      table: "#e9e3d8",
    });
    expect(visualSettings.font.family).toBe('"Inter", system-ui, -apple-system, "Segoe UI", sans-serif');
    expect(visualSettings.font.googleStylesheet).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
    expect(visualSettings.brand.logoImage).toBe("/brand/palette/slonovaca.png");
    expect(visualSettings.brand.favicon).toBe("/brand/palette/slonovaca.png");
    expect(visualSettings.layout.mobileBreakpoint).toBe(767);
  });

  it("generates deterministic CSS tokens without changing their configured values", () => {
    const variables = createVisualCssVariables(visualSettings);
    expect(variables["--orah"]).toBe("#355c4b");
    expect(variables["--font"]).toBe(visualSettings.font.family);
    expect(variables["--layout-page-width"]).toBe("560px");
    expect(variables["--layout-page-width-wide"]).toBe("1240px");
    expect(variables["--salon-table"]).toBe("#e9e3d8");
    expect(variables["--salon-panel"]).toBe("#f5f1e8");
    expect(variables["--layout-sidebar-width"]).toBe("220px");
    expect(createVisualCssText(visualSettings)).toContain("--navigation-background:#eee8dc");
    expect(createVisualCssText(visualSettings)).toBe(createVisualCssText(visualSettings));
  });

  it("routes custom visual values to their tokens without mutating defaults", () => {
    const baseline = structuredClone(visualSettings);
    const custom = structuredClone(visualSettings);
    custom.palette.primary = "#67412a";
    custom.palette.night = "#31485a";
    custom.font.family = '"Lora", serif';
    custom.font.pageTitleSize = "30px";
    custom.buttons.radius = "10px";
    custom.navigation.background = "#eee1cf";
    custom.home.background = "linear-gradient(90deg, #26384a, #50382c)";
    custom.layout.desktopPageWidth = "640px";
    custom.layout.mobilePagePadding = "20px";

    const variables = createVisualCssVariables(custom);
    expect(variables["--orah"]).toBe("#67412a");
    expect(variables["--noc"]).toBe("#31485a");
    expect(variables["--font"]).toBe('"Lora", serif');
    expect(variables["--font-size-page-title"]).toBe("30px");
    expect(variables["--button-radius"]).toBe("10px");
    expect(variables["--navigation-background"]).toBe("#eee1cf");
    expect(variables["--home-background"]).toBe("linear-gradient(90deg, #26384a, #50382c)");
    expect(variables["--layout-page-width"]).toBe("640px");
    expect(variables["--layout-page-padding-mobile"]).toBe("20px");
    expect(visualSettings).toEqual(baseline);
  });

  it("renders an accessible home link with the exact default wordmark and tagline", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Brand)));
    expect(markup).toContain('href="/"');
    expect(markup).toContain('class="wordmark"');
    expect(markup).toContain('src="/brand/palette/slonovaca.png"');
    expect(markup).not.toContain("LIMEN<small>");
  });

  it("uses one unchanged official logo in every palette preview", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PaletteReview)));
    const imageSources = [...markup.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(imageSources).toHaveLength(ROOM_PALETTES.length + 2);
    expect(new Set(imageSources)).toEqual(new Set([visualSettings.brand.logoImage]));
    expect((markup.match(/class="palette-review-card"/g) ?? [])).toHaveLength(ROOM_PALETTES.length);
    const editorMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RoomEditor)));
    const editorImages = [...editorMarkup.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(editorImages).toHaveLength(ROOM_PALETTES.length + 1);
    expect(new Set(editorImages)).toEqual(new Set([visualSettings.brand.logoImage]));
  });

  it("keeps all five real navigation routes rather than the prototype's two-page links", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(Shell, null, createElement("p", null, "Sadržaj"))));
    for (const route of ["/", "/chat", "/kontakti", "/moja-soba", "/postavke"]) {
      expect(markup).toContain(`href="${route}"`);
    }
    expect(markup).not.toContain("__mockup");
    expect(markup).not.toContain("prototip");
  });

  it("uses only the twelve approved source palette crops and preserves their coordinates", () => {
    expect(ROOM_PALETTES).toHaveLength(12);
    expect(paletteBackground(ROOM_PALETTES[2])).toContain("#e9deca");
    expect(ROOM_PALETTES.map(({ row, column }) => `${row}:${column}`)).toEqual([
      "1:2", "1:3", "1:5", "2:2", "2:3", "3:1", "3:2", "3:4", "3:5", "4:1", "4:4", "4:5",
    ]);
  });
});
