export type Source = "optical" | "fused" | "radar" | "none";

/** One month of one lake (web/public/data/series/<lake>.json). null = not available. */
export interface Row {
  month: string;
  source: Source;
  area_ha: number | null;
  unc_ha: number | null;
  confidence: number | null;
  optical_date: string | null;
  optical_coverage: number | null;
  optical_ha: number | null;
  radar_ha: number | null;
  radar_scenes: number | null;
  ndci_median: number | null;
  fai_frac: number | null;
  floating_mat: boolean | null;
  foam_ha: number | null;
  haze: boolean | null;
  chl_high: boolean | null;
  rain_mm: number | null;
}

export interface LakeIndex {
  id: string;
  name: string;
  name_kn: string | null;
  outline_ha: number;
  osm_refs: string[];
  bbox: [number, number, number, number];
  centroid: [number, number];
  months: number;
  months_with_extent: number;
  first_month: string;
  last_month: string;
  latest_extent: { month: string; area_ha: number; source: Source };
  health: { score: number; range: [number, number]; low_coverage: boolean };
}

export interface Health {
  score: number;
  sensitivity_range: [number, number];
  alternative_weightings: Record<string, number>;
  components: Record<"extent_stability" | "bloom" | "encroachment" | "anomalies", number>;
  weights: Record<string, number>;
  inputs: {
    window: [string, string];
    months_with_extent: number;
    months_in_span: number;
    extent_cv: number | null;
    clean_optical_months: number;
    floating_mat_share: number | null;
    ndci_median: number | null;
    upper_bound_built_pct_of_early_footprint: number | null;
    alarm_events: number;
  };
  low_coverage: boolean;
  notes: string[];
}

export interface EventItem {
  lake_id: string;
  month: string;
  obs_date: string;
  date_is_approx: boolean;
  type: string;
  value: number;
  detail: string;
  confidence: number | null;
  source: string;
  follows_rain: boolean;
  rain_prior_14d_mm: number | null;
  rain_event_end: string | null;
  rain_event_total_mm: number | null;
  rain_event_lag_days: number | null;
  near_inlet?: boolean | null;
}

export interface Validation {
  ground_truth: { events: number; testable: number; distinct_sources: number };
  water_level: { event_id: string; lake: string; signal: string; window: string; outcome: string }[];
  foam: { event_id: string; lake: string; window: string; outcome: string }[];
}

export const SOURCE_LABEL: Record<Source, string> = {
  optical: "Optical (Sentinel-2)",
  fused: "Fused optical + radar",
  radar: "Radar (Sentinel-1)",
  none: "No usable data",
};

export interface RainLag {
  lag: number;
  rho: number | null;
  ci: [number | null, number | null];
  n: number;
  clear: boolean;
}

export interface RainResponse {
  lake_id: string;
  months: number;
  method: string;
  block_months: number;
  resamples: number;
  lags: RainLag[];
  best_lag: number | null;
  direction: "more water" | "less water" | null;
  caveats: string[];
}
