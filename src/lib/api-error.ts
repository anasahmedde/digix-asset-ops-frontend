export function getApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as { response?: { status?: number; data?: { detail?: string } } }).response;
    if (resp?.status === 403) {
      return "You do not have permission to perform this action.";
    }
    if (resp?.data?.detail) {
      return resp.data.detail;
    }
  }
  return fallback;
}
