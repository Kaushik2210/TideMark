# Data licence

Datasets that Tidemark **derives** (everything under `data/` and the downloadable
CSV/GeoJSON/Parquet files on the site) are released under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Please credit: "Tidemark (https://github.com/Kaushik2210/TideMark), derived from Copernicus
Sentinel data, OpenStreetMap contributors and other sources listed in DATA_SOURCES.md".

## Upstream terms still apply

Derived data inherits obligations from its inputs. In particular:

- **OpenStreetMap** geometry is © OpenStreetMap contributors and licensed under the
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Lake polygons in
  `data/lakes.geojson` are a derived database; they remain under ODbL
  (share-alike) and must keep the OSM attribution. See DATA_SOURCES.md.
- **Copernicus Sentinel-1/-2** data: free, full and open (Regulation (EU) No 1159/2013);
  acknowledge "Contains modified Copernicus Sentinel data".
- Other sources are listed, with their licences, in DATA_SOURCES.md.

Where the two conflict, the stricter upstream licence governs that specific file.

## Exception: Ghost Lakes

`data/ghost_lakes.geojson` is derived from Wikipedia text and is therefore released under
**CC BY-SA 4.0** (share-alike), not CC BY. It also carries WorldCover-derived fields (CC BY 4.0).
Attribute: "Wikipedia contributors, 'Lakes in Bengaluru' (revision recorded per feature), CC BY-SA 4.0".
It is kept as a separate file so that its share-alike terms do not attach to the other datasets.

## Satellite basemap

`web/public/bengaluru-2025.webp` is a cropped regional overview assembled from EOxCloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025). It retains the upstream [CC BY-NC-SA 4.0 licence](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [EOX terms](https://cloudless.eox.at/documentation/license).

The monthly images and contact-sheet thumbnails under `web/public/data/scenes/` contain modified
Copernicus Sentinel data from the acquisition year in each filename. The source scene is identified
in `index.json`. The separate `web/public/data/city-lakes.geojson` directory is derived from
OpenStreetMap contributors and retains the ODbL 1.0 licence.
