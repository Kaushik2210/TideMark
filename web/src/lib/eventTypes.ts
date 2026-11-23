/** Plain-language label and validation status for each candidate type (from VALIDATION.md). */
export const EVENT_TYPES: Record<string, { label: string; status: "supported" | "weak" | "unvalidated" | "failed"; note: string }> = {
  extent_low: { label: "Water area unusually low", status: "supported", note: "Matched Ulsoor's 2026 draining; extent itself agrees with JRC." },
  extent_high: { label: "Water area unusually high", status: "unvalidated", note: "No ground truth for these dates." },
  rapid_change: { label: "Rapid month-to-month change", status: "weak", note: "2 of 13 matched a documented event; may be a sensor or cloud artifact." },
  floating_mat_candidate: { label: "Floating-mat candidate", status: "unvalidated", note: "Not validated; marks a persistent condition more than an episode." },
  chlorophyll_high_candidate: { label: "Chlorophyll in the lake's top decile", status: "unvalidated", note: "A ranking against the lake's own record, not an absolute bloom." },
  foam_candidate: { label: "Foam candidate", status: "failed", note: "Foam detection failed validation: this flag is likely a false alarm." },
};
