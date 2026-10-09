const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getAuthToken() {
  try {
    const raw = sessionStorage.getItem("empsys_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

// Turns FastAPI error payloads (string or validation list) into one readable message.
async function request(path, options = {}) {
  let response;
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Cannot reach the API. Is the backend running on " + BASE_URL + "?");
  }

  if (response.status === 204) return null;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d) => `${d.loc.slice(1).join(".")}: ${d.msg}`).join("; "));
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return body;
}

export const api = {
  authStatus: () => request("/auth/status"),
  signup: (data) => request("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  getDashboard: () => request("/dashboard"),
  getEmployees: (search = "") =>
    request(`/employees${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createEmployee: (data) => request("/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id, data) =>
    request(`/employees/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: "DELETE" }),
  getProfile: (userId) => request(`/auth/profile/${userId}`),
  updateProfile: (data) =>
    request("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),
  verifyOtp: (data) =>
    request("/auth/verify-otp", { method: "POST", body: JSON.stringify(data) }),
  resendOtp: (data) =>
    request("/auth/resend-otp", { method: "POST", body: JSON.stringify(data) }),
};

