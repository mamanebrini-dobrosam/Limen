import type { CSSProperties } from "react";
import { RoomView } from "./_shared/pages/Room";
import { createVisualCssVariables } from "./_shared/visual/tokens";
import { visualSettings } from "./_shared/visual/settings";
import "./_group.css";
import "./proposal.css";
export function Room() {
  return <div className="limen-extracted" style={createVisualCssVariables(visualSettings) as CSSProperties}><RoomView /></div>;
}
