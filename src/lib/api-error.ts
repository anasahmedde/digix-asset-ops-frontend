export function getApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as {
      response?: { status?: number; data?: Record<string, unknown> };
    }).response;
    const data = resp?.data;
    if (resp?.status === 403) {
      // A refusal usually says why — a locked build, a fixed budget, a role
      // rule. Only fall back to the bare permission text when it does not.
      if (data && typeof data.detail === "string" && data.detail && !/permission/i.test(data.detail)) {
        return data.detail;
      }
      return "You do not have permission to perform this action.";
    }
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
      // Service-level checks raise {"field": "message"} with a plain string;
      // without this branch the message was lost behind the fallback text.
      const plain = Object.entries(data).find(([, v]) => typeof v === "string" && v);
      if (plain) {
        return plain[0] === "quantity" ? (plain[1] as string) : `${plain[0]}: ${plain[1]}`;
      }
    }
  }
  return fallback;
}
