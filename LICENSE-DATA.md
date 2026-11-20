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
