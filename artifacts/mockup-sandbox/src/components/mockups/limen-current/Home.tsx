import type { CSSProperties } from "react";
import { Home as ExtractedHome } from "./_shared/pages/Home";
import { createVisualCssVariables } from "./_shared/visual/tokens";
import { visualSettings } from "./_shared/visual/settings";
import "./_group.css";
export function Home() {
  return <div className="limen-extracted" style={createVisualCssVariables(visualSettings) as CSSProperties}><ExtractedHome /></div>;
}
