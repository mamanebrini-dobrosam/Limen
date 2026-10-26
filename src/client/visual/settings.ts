export type VisualSettings = {
  brand: {
    name: string;
    tagline: string;
    title: string;
    favicon: string;
    logoImage: string | null;
    logoWidth: string;
    mobileLogoWidth: string;
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
    panel: string;
    border: string;
    table: string;
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
    activeBackground: string;
  };
  layout: {
    mobileBreakpoint: number;
    mobilePagePadding: string;
    desktopPagePadding: string;
    desktopPageWidth: string;
    desktopWidePageWidth: string;
    mobileTopbarPadding: string;
    desktopTopbarPadding: string;
    sidebarWidth: string;
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
    logoWidth: "102px",
    mobileLogoWidth: "88px",
  },
  palette: {
    primary: "#355c4b",
    primaryDark: "#294a3b",
    background: "#f2eee5",
    backgroundSecondary: "#e7e0d3",
    secondary: "#986d34",
    secondaryDark: "#765326",
    night: "#062d23",
    nightDark: "#021d15",
    text: "#253a32",
    mutedText: "#59675f",
    surface: "#fbf9f3",
    paperWhite: "#f6f2e9",
    error: "#893b31",
    highlight: "#fff0c4",
    inputBorder: "#cfc5b4",
    inputText: "#293d33",
    panel: "#f5f1e8",
    border: "#d5ccbc",
    table: "#e9e3d8",
  },
  font: {
    family: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleStylesheet: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    bodySize: "15px",
    pageTitleSize: "38px",
    sectionTitleSize: "19px",
    wordmarkSize: "15px",
    taglineSize: "12px",
    navigationSize: "13px",
    buttonSize: "13px",
  },
  buttons: {
    height: "44px",
    padding: "9px 16px",
    radius: "4px",
    weight: "600",
    borderColor: "#bcb29f",
    ghostHover: "#ece6d9",
    dangerBorder: "#cbb4ac",
  },
  navigation: {
    background: "#eee8dc",
    border: "#d5ccbc",
    active: "#243b31",
    inactive: "#58665e",
    padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
    tabPadding: "8px 4px",
    activeBackground: "#dfd8c9",
  },
  layout: {
    mobileBreakpoint: 767,
    mobilePagePadding: "23px 18px 100px",
    desktopPagePadding: "40px clamp(28px, 5vw, 72px) 50px",
    desktopPageWidth: "560px",
    desktopWidePageWidth: "1240px",
    mobileTopbarPadding: "12px 18px",
    desktopTopbarPadding: "18px 25px",
    sidebarWidth: "220px",
  },
  home: {
    background: "linear-gradient(90deg, #f6f3eb 0%, #f6f3eb 62%, #ece6da 100%)",
    foreground: "#253a32",
    padding: "clamp(26px, 4vw, 46px)",
    radius: "5px",
    titleSize: "38px",
    copyColor: "#536159",
  },
};
