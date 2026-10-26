import type { VisualSettings } from "./settings";

export type VisualCssVariables = Record<`--${string}`, string>;

export function createVisualCssVariables(settings: VisualSettings): VisualCssVariables {
  const { palette, font, buttons, navigation, layout, home } = settings;
  return {
    "--orah": palette.primary,
    "--orah-tamni": palette.primaryDark,
    "--krem": palette.background,
    "--krem-2": palette.backgroundSecondary,
    "--kadulja": palette.secondary,
    "--kadulja-tamna": palette.secondaryDark,
    "--noc": palette.night,
    "--noc-2": palette.nightDark,
    "--tekst": palette.text,
    "--tekst-blag": palette.mutedText,
    "--surface": palette.surface,
    "--paper-white": palette.paperWhite,
    "--greska": palette.error,
    "--svjetlo": palette.highlight,
    "--font": font.family,
    "--font-size-body": font.bodySize,
    "--font-size-page-title": font.pageTitleSize,
    "--font-size-section-title": font.sectionTitleSize,
    "--font-size-wordmark": font.wordmarkSize,
    "--font-size-tagline": font.taglineSize,
    "--font-size-navigation": font.navigationSize,
    "--font-size-button": font.buttonSize,
    "--input-border": palette.inputBorder,
    "--input-background": palette.surface,
    "--input-text": palette.inputText,
    "--button-height": buttons.height,
    "--button-padding": buttons.padding,
    "--button-radius": buttons.radius,
    "--button-weight": buttons.weight,
    "--button-border": buttons.borderColor,
    "--button-ghost-hover": buttons.ghostHover,
    "--button-danger-border": buttons.dangerBorder,
    "--navigation-background": navigation.background,
    "--navigation-border": navigation.border,
    "--navigation-active": navigation.active,
    "--navigation-inactive": navigation.inactive,
    "--navigation-padding": navigation.padding,
    "--navigation-tab-padding": navigation.tabPadding,
    "--layout-page-width": layout.desktopPageWidth,
    "--layout-page-width-wide": layout.desktopWidePageWidth,
    "--layout-page-padding-mobile": layout.mobilePagePadding,
    "--layout-page-padding-desktop": layout.desktopPagePadding,
    "--layout-topbar-padding": layout.desktopTopbarPadding,
    "--layout-topbar-padding-mobile": layout.mobileTopbarPadding,
    "--home-background": home.background,
    "--home-foreground": home.foreground,
    "--home-padding": home.padding,
    "--home-radius": home.radius,
    "--home-title-size": home.titleSize,
    "--home-copy-color": home.copyColor,
  };
}

export function createVisualCssText(settings: VisualSettings): string {
  const declarations = Object.entries(createVisualCssVariables(settings))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `:root{${declarations}}`;
}
