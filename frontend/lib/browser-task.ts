export function normalizeBrowserTaskParams(
  taskType: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
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
