import { MapExplorer } from "@/components/MapExplorer";

import { getArchive, getCityLakes } from "@/lib/server-data";

export default function HomePage() {
  return <MapExplorer archive={getArchive()} places={getCityLakes()} />;
}
