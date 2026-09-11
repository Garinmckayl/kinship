export function normalizeBrowserTaskParams(
  taskType: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (taskType === "provider_search") {
    const zipCode = String(raw.zip_code ?? raw.zip ?? "43215").trim();
    return {
      ...raw,
      zip_code: /^\d{5}$/.test(zipCode) ? zipCode : "43215",
      specialty: String(raw.specialty ?? "Internal Medicine"),
      max_results: Math.min(5, Math.max(1, Number(raw.max_results ?? 3))),
    };
  }
  if (taskType !== "insurance_check") return raw;

  const source = raw.medications ?? raw.medication;
  const medications = Array.isArray(source)
    ? source.map(String).map((value) => value.trim()).filter(Boolean)
    : typeof source === "string"
      ? source.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

  const zipCode = String(raw.zip_code ?? raw.zip ?? "43215").trim();
  return {
    ...raw,
    insurance_type: String(raw.insurance_type ?? "Medicare"),
    zip_code: /^\d{5}$/.test(zipCode) ? zipCode : "43215",
    medications: medications.length
      ? medications
      : ["Lisinopril", "Metformin", "Vitamin D", "Atorvastatin"],
  };
}
