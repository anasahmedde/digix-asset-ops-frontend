export function getApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as {
      response?: { status?: number; data?: Record<string, unknown> };
    }).response;
    if (resp?.status === 403) {
      return "You do not have permission to perform this action.";
    }
    const data = resp?.data;
    if (data) {
      if (typeof data.detail === "string" && data.detail) {
        return data.detail;
      }
      // DRF validation shapes: non_field_errors first, then the first
      // field-error array, rendered as "field: message".
      const nfe = data.non_field_errors;
      if (Array.isArray(nfe) && nfe.length) {
        return nfe.join(" ");
      }
      const fieldEntry = Object.entries(data).find(
        ([, v]) => Array.isArray(v) && v.length && typeof v[0] === "string"
      );
      if (fieldEntry) {
        return `${fieldEntry[0]}: ${(fieldEntry[1] as string[]).join(" ")}`;
      }
    }
  }
  return fallback;
}
