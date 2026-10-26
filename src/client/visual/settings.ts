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
    favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2326384A'/%3E%3Cpath d='M9 26V9h3v14h11v3z' fill='%23F5EBDD'/%3E%3C/svg%3E",
    logoImage: null,
  },
  palette: {
    primary: "#50382c",
    primaryDark: "#3a281f",
    background: "#f5ebdd",
    backgroundSecondary: "#ebdcc8",
    secondary: "#82927b",
    secondaryDark: "#5f6d59",
    night: "#26384a",
    nightDark: "#1c2a38",
    text: "#26384a",
    mutedText: "#5c6670",
    surface: "#fffaf3",
    paperWhite: "#fff",
    error: "#9b3b2f",
    highlight: "#f3d9a4",
    inputBorder: "#cdbba3",
    inputText: "#26384a",
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
    borderColor: "#cdbba3",
    ghostHover: "#ebdcc8",
    dangerBorder: "#d9b3ab",
  },
  navigation: {
    background: "#f5ebdd",
    border: "#ebdcc8",
    active: "#26384a",
    inactive: "#5c6670",
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
    background: "radial-gradient(120% 90% at 70% 0%, #3a4f63 0%, #26384a 55%, #1c2a38 100%)",
    foreground: "#f5ebdd",
    padding: "26px 22px 22px",
    radius: "12px",
    titleSize: "24px",
    copyColor: "#d5d9dd",
  },
};
