type ApiErrorPayload = {
  error?: unknown;
};

function statusFallbackMessage(status: number, fallback: string): string {
  if (status === 400) {
    return "Some fields are invalid. Please review your input.";
  }
  if (status === 401 || status === 403) {
    return "You are not authorized for this action.";
  }
  if (status === 404) {
    return "Requested record was not found.";
  }
  if (status === 409) {
    return "This action conflicts with current record state.";
  }
  if (status >= 500) {
    return "Server error occurred. Please try again in a few seconds.";
  }
  return fallback;
}

export function vetHumanizeErrorMessage(
  rawMessage: string | null | undefined,
  status?: number,
  fallback = "Request could not be completed."
): string {
  const normalized = (rawMessage ?? "").trim();
  if (!normalized) {
    return typeof status === "number" ? statusFallbackMessage(status, fallback) : fallback;
  }

  const lower = normalized.toLowerCase();

  if (
    lower === "failed to fetch" ||
    lower === "fetch failed" ||
    lower.includes("networkerror when attempting to fetch resource") ||
    lower.includes("network request failed")
  ) {
    return "Could not connect to the server. Please try again.";
  }

  if (lower.startsWith("http ")) {
    return typeof status === "number" ? statusFallbackMessage(status, fallback) : fallback;
  }

  if (lower.includes("unexpected token") && lower.includes("json")) {
    return "Server returned an unexpected response. Please try again.";
  }

  if (lower.includes("database_url is not configured")) {
    return "Server configuration is incomplete. Please contact the administrator.";
  }

  if (lower.includes("vaccines must be recorded in the vaccination section")) {
    return "Vaccines cannot be prescribed from Prescription. Please use the Vaccination section.";
  }

  if (lower.includes("vaccinationbatchno is required")) {
    return "Vaccination batch number is required.";
  }

  if (lower.includes("newdatetime must be a valid iso datetime string")) {
    return "Please enter a valid date and time.";
  }

  if (lower.includes("must be in yyyy-mm-dd format")) {
    return "Please enter the date in YYYY-MM-DD format.";
  }

  if (lower.includes("duplicate key value violates unique constraint")) {
    return "This record already exists.";
  }

  if (lower.includes("violates foreign key constraint")) {
    return "Related record was not found or is no longer valid.";
  }

  if (lower.includes("violates check constraint")) {
    return "Input values do not satisfy required rules.";
  }

  return normalized;
}

export function vetBuildApiErrorMessage(
  payload: unknown,
  status: number,
  fallback = "Request could not be completed."
): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const apiError = (payload as ApiErrorPayload).error;
    if (typeof apiError === "string") {
      return vetHumanizeErrorMessage(apiError, status, fallback);
    }
  }

  return statusFallbackMessage(status, fallback);
}

export function vetBuildClientErrorMessage(
  error: unknown,
  fallback = "Request could not be completed."
): string {
  if (error instanceof Error) {
    return vetHumanizeErrorMessage(error.message, undefined, fallback);
  }
  return fallback;
}
