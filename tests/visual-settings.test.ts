import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Brand } from "../src/client/visual/Brand";
import { visualSettings } from "../src/client/visual/settings";
import { createVisualCssText, createVisualCssVariables } from "../src/client/visual/tokens";

describe("LIMEN visual settings", () => {
  it("keeps current palette, typography and static favicon defaults", () => {
    expect(visualSettings.palette).toMatchObject({
      primary: "#50382c",
      primaryDark: "#3a281f",
      background: "#f5ebdd",
      backgroundSecondary: "#ebdcc8",
      night: "#26384a",
      nightDark: "#1c2a38",
      text: "#26384a",
      mutedText: "#5c6670",
    });
    expect(visualSettings.font.family).toBe('"Inter", system-ui, -apple-system, "Segoe UI", sans-serif');
    expect(visualSettings.brand.favicon).toBe("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2326384A'/%3E%3Cpath d='M9 26V9h3v14h11v3z' fill='%23F5EBDD'/%3E%3C/svg%3E");
    expect(visualSettings.layout.mobileBreakpoint).toBe(480);
  });

  it("generates deterministic CSS tokens without changing their configured values", () => {
    const variables = createVisualCssVariables(visualSettings);
    expect(variables["--orah"]).toBe("#50382c");
    expect(variables["--font"]).toBe(visualSettings.font.family);
    expect(variables["--layout-page-width"]).toBe("560px");
    expect(createVisualCssText(visualSettings)).toContain("--navigation-background:#f5ebdd");
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
    expect(markup).toContain("LIMEN<small>mjesto gdje priče žive</small>");
  });
});
