export type VisualSettings = {
  brand: {
    name: string;
    tagline: string;
    title: string;
    favicon: string;
    logoImage: string | null;
  };
  palette: {
    primary: string;
    primaryDark: string;
    secondary: string;
    secondaryDark: string;
    background: string;
    backgroundSecondary: string;
    night: string;
    nightDark: string;
    text: string;
    mutedText: string;
    surface: string;
    paperWhite: string;
    error: string;
    highlight: string;
    inputBorder: string;
    inputText: string;
  };
  font: {
    family: string;
    googleStylesheet: string;
    bodySize: string;
    pageTitleSize: string;
    sectionTitleSize: string;
    wordmarkSize: string;
    taglineSize: string;
    navigationSize: string;
    buttonSize: string;
  };
  buttons: {
    height: string;
    padding: string;
    radius: string;
    weight: string;
    borderColor: string;
    ghostHover: string;
    dangerBorder: string;
  };
  navigation: {
    background: string;
    border: string;
    active: string;
    inactive: string;
    padding: string;
    tabPadding: string;
  };
  layout: {
    mobileBreakpoint: number;
    mobilePagePadding: string;
    desktopPagePadding: string;
    desktopPageWidth: string;
    desktopWidePageWidth: string;
    mobileTopbarPadding: string;
    desktopTopbarPadding: string;
  };
  home: {
    background: string;
    foreground: string;
    padding: string;
    radius: string;
    titleSize: string;
    copyColor: string;
  };
};

/**
 * Static presentation configuration only. Access, authentication, security,
 * token lifetimes and authorization rules are intentionally not configurable.
 */
export const visualSettings: VisualSettings = {
  brand: {
    name: "LIMEN",
    tagline: "mjesto gdje priče žive",
    title: "LIMEN — mjesto gdje priče žive",
    favicon: "/brand/palette/slonovaca.png",
    logoImage: "/brand/palette/slonovaca.png",
  },
  palette: {
    primary: "#034537",
    primaryDark: "#02372d",
    background: "#e9deca",
    backgroundSecondary: "#ddd0b9",
    secondary: "#a87825",
    secondaryDark: "#795316",
    night: "#062d23",
    nightDark: "#021d15",
    text: "#17372e",
    mutedText: "#53665c",
    surface: "#f8f2e8",
    paperWhite: "#f8f2e8",
    error: "#8d3028",
    highlight: "#fff0c4",
    inputBorder: "#b9aa91",
    inputText: "#17372e",
  },
  font: {
    family: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleStylesheet: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    bodySize: "16px",
    pageTitleSize: "26px",
    sectionTitleSize: "18px",
    wordmarkSize: "15px",
    taglineSize: "12px",
    navigationSize: "13px",
    buttonSize: "16px",
  },
  buttons: {
    height: "44px",
    padding: "10px 18px",
    radius: "6px",
    weight: "600",
    borderColor: "#b9aa91",
    ghostHover: "#ddd0b9",
    dangerBorder: "#d9b3ab",
  },
  navigation: {
    background: "#e9deca",
    border: "#d4c6ad",
    active: "#062d23",
    inactive: "#53665c",
    padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
    tabPadding: "8px 4px",
  },
  layout: {
    mobileBreakpoint: 480,
    mobilePagePadding: "16px",
    desktopPagePadding: "16px",
    desktopPageWidth: "560px",
    desktopWidePageWidth: "760px",
    mobileTopbarPadding: "14px 16px",
    desktopTopbarPadding: "14px 16px",
  },
  home: {
    background: "radial-gradient(110% 90% at 84% 0%, #087260 0%, #034537 42%, #021d15 100%)",
    foreground: "#fff9e8",
    padding: "26px 22px 22px",
    radius: "12px",
    titleSize: "24px",
    copyColor: "#d9e8dc",
  },
};
