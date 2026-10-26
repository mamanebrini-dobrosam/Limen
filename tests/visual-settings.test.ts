import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Brand } from "../src/client/visual/Brand";
import { visualSettings } from "../src/client/visual/settings";
import { createVisualCssText, createVisualCssVariables } from "../src/client/visual/tokens";
import { ROOM_PALETTES, paletteBackground, paletteLogo } from "../src/shared/room-palettes";

describe("LIMEN visual settings", () => {
  it("uses the approved emerald and warm-ivory palette with source-image branding", () => {
    expect(visualSettings.palette).toMatchObject({
      primary: "#034537",
      primaryDark: "#02372d",
      background: "#e9deca",
      backgroundSecondary: "#ddd0b9",
      night: "#062d23",
      nightDark: "#021d15",
      text: "#17372e",
      mutedText: "#53665c",
    });
    expect(visualSettings.font.family).toBe('"Inter", system-ui, -apple-system, "Segoe UI", sans-serif');
    expect(visualSettings.font.googleStylesheet).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
    expect(visualSettings.brand.logoImage).toBe("/brand/palette/slonovaca.png");
    expect(visualSettings.brand.favicon).toBe("/brand/palette/slonovaca.png");
    expect(visualSettings.layout.mobileBreakpoint).toBe(480);
  });

  it("generates deterministic CSS tokens without changing their configured values", () => {
    const variables = createVisualCssVariables(visualSettings);
    expect(variables["--orah"]).toBe("#034537");
    expect(variables["--font"]).toBe(visualSettings.font.family);
    expect(variables["--layout-page-width"]).toBe("560px");
    expect(createVisualCssText(visualSettings)).toContain("--navigation-background:#e9deca");
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

  it("uses only the twelve approved source palette crops and preserves their coordinates", () => {
    expect(ROOM_PALETTES).toHaveLength(12);
    expect(paletteLogo(ROOM_PALETTES[0])).toBe("/brand/palette/smaragd.png");
    expect(paletteBackground(ROOM_PALETTES[2])).toContain("#e9deca");
    expect(ROOM_PALETTES.map(({ row, column }) => `${row}:${column}`)).toEqual([
      "1:2", "1:3", "1:5", "2:2", "2:3", "3:1", "3:2", "3:4", "3:5", "4:1", "4:4", "4:5",
    ]);
  });
});
