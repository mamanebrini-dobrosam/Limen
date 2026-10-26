import { Link } from "react-router-dom";
import { visualSettings } from "./settings";

export function Brand({ to = "/" }: { to?: string }) {
  const { brand } = visualSettings;
  return (
    <Link to={to} className="wordmark">
      {brand.logoImage ? <img className="brand-image" src={brand.logoImage} alt={brand.name} /> : brand.name}
      {!brand.logoImage && <small>{brand.tagline}</small>}
    </Link>
  );
}
