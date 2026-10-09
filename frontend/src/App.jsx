import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard.jsx";
import Employees from "./components/Employees.jsx";
import Profile from "./components/Profile.jsx";
import Auth from "./components/Auth.jsx";

const PAGES = [
  { id: "profile", label: "Profile" },
  { id: "dashboard", label: "Dashboard" },
  { id: "employees", label: "Employees" },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [auth, setAuth] = useState(() => {
    try {
      // Purge any lingering permanent localStorage auth so auto-logout on browser close is guaranteed
      localStorage.removeItem("empsys_auth");
      const stored = sessionStorage.getItem("empsys_auth");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Ensure localStorage is cleared of any residual credentials on mount
  useEffect(() => {
    try {
      localStorage.removeItem("empsys_auth");
    } catch {
      // ignore
    }
  }, []);

  function handleLogin(userAuth) {
    setAuth(userAuth);
    // When logging in, always navigate directly to dashboard
    setPage("dashboard");
  }

  function handleLogout() {
    sessionStorage.removeItem("empsys_auth");
    localStorage.removeItem("empsys_auth");
    setAuth(null);
    setPage("dashboard");
  }

  function handleUpdateUser(updatedUser) {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...updatedUser } };
      sessionStorage.setItem("empsys_auth", JSON.stringify(next));
      return next;
    });
  }

  if (!auth) {
    return <Auth onLogin={handleLogin} />;
  }

  const user = auth?.user || {};
  const initials = user.full_name
    ? user.full_name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark">E</span>
            <span className="brand-name">EMPSYS CRM</span>
          </div>
          <nav>
            {PAGES.map((p) => (
              <button
                key={p.id}
                className={`nav-item ${page === p.id ? "active" : ""}`}
                onClick={() => setPage(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>

        {/* User profile & Logout footer */}
        <div className="sidebar-user-section">
          <div
            className={`user-badge-card ${page === "profile" ? "active-badge" : ""}`}
            onClick={() => setPage("profile")}
            title="Click to view profile and settings"
            role="button"
            tabIndex={0}
          >
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name-row">
                <span className="user-name">{user.full_name || "User"}</span>
                <span className={`user-role-tag ${user.role === "SUPER_ADMIN" ? "role-tag-super" : "role-tag-user"}`}>
                  {user.role === "SUPER_ADMIN" ? "Super Admin" : "User"}
                </span>
              </div>
              <span className="user-email">{user.email || ""}</span>
            </div>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={handleLogout}
            title="Log out of session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      <main className="content">
        {page === "profile" && (
          <Profile
            user={user}
            onUpdateUser={handleUpdateUser}
            onLogout={handleLogout}
          />
        )}
        {page === "dashboard" && <Dashboard />}
        {page === "employees" && <Employees user={user} />}
      </main>
    </div>
  );
}
