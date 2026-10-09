import { useState } from "react";
import { api } from "../api.js";

export default function Profile({ user, onUpdateUser, onLogout }) {
  // Name update state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileErr, setProfileErr] = useState(null);

  // Password change state
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState(null);
  const [passErr, setPassErr] = useState(null);

  // Initials for avatar
  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  // Format created date
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Recently";

  // Handle Profile Details update
  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileErr(null);
    setProfileMsg(null);

    const trimmed = fullName.trim();
    if (!trimmed || trimmed.length < 2) {
      setProfileErr("Full name must be at least 2 characters long.");
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await api.updateProfile({
        user_id: user.user_id,
        full_name: trimmed,
      });
      setProfileMsg("Profile updated successfully!");
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
    } catch (err) {
      setProfileErr(err.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  // Handle Change Password
  async function handleChangePassword(e) {
    e.preventDefault();
    setPassErr(null);
    setPassMsg(null);

    if (!passwords.currentPassword) {
      setPassErr("Please enter your current password.");
      return;
    }
    if (passwords.newPassword.length < 6) {
      setPassErr("New password must be at least 6 characters long.");
      return;
    }
    if (passwords.newPassword === passwords.currentPassword) {
      setPassErr("New password cannot be identical to your current password.");
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPassErr("New password and confirm password do not match.");
      return;
    }

    setPassSaving(true);
    try {
      const res = await api.changePassword({
        user_id: user.user_id,
        current_password: passwords.currentPassword,
        new_password: passwords.newPassword,
      });
      setPassMsg(res.message || "Password updated successfully!");
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setPassErr(err.message || "Failed to change password.");
    } finally {
      setPassSaving(false);
    }
  }

  return (
    <div className="profile-page">
      {/* Header */}
      <div className="page-head">
        <h1>User Profile</h1>
        <p className="muted">
          Manage your personal information, credentials, and active session settings.
        </p>
      </div>

      {/* Hero Overview Card */}
      <div className="profile-hero-card">
        <div className="profile-hero-avatar">{initials}</div>
        <div className="profile-hero-details">
          <div className="profile-hero-name-row">
            <h2 className="profile-hero-name">{user?.full_name || "User"}</h2>
            <span className={`profile-hero-role ${user?.role === "SUPER_ADMIN" ? "role-super-admin" : "role-user"}`}>
              {user?.role === "SUPER_ADMIN" ? "Super Admin" : "User"}
            </span>
          </div>
          <p className="profile-hero-email">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            {user?.email}
          </p>
          <div className="profile-hero-meta">
            <span className="profile-meta-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Joined: {memberSince}
            </span>
            <span className="profile-meta-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Role: {user?.role === "SUPER_ADMIN" ? "Designated Super Admin" : "Standard User"}
            </span>
            <span className="profile-meta-pill active-pill">
              <span className="status-dot-pulse" />
              Session: Auto-logout on browser close
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Edit Name / Change Password */}
      <div className="profile-grid">
        {/* Personal Details Form */}
        <section className="profile-section-card">
          <div className="card-header-with-icon">
            <div className="header-icon-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h3>Personal Information</h3>
              <p className="card-subtitle">
                {user?.role === "SUPER_ADMIN"
                  ? "Designated Super Admin: Full management permissions enabled."
                  : "Standard User: Employee viewing permissions enabled (view-only)."}
              </p>
            </div>
          </div>

          {profileMsg && (
            <div className="profile-alert success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{profileMsg}</span>
            </div>
          )}

          {profileErr && (
            <div className="profile-alert error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{profileErr}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="profile-form">
            <div className="form-group">
              <label htmlFor="profile-fullname">Full Name</label>
              <input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (profileErr) setProfileErr(null);
                  if (profileMsg) setProfileMsg(null);
                }}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="profile-email">Email Address</label>
              <input
                id="profile-email"
                type="email"
                value={user?.email || ""}
                disabled
                className="input-disabled"
                title="Email cannot be changed"
              />
              <span className="field-note">
                Your email address is your unique system identifier and cannot be altered.
              </span>
            </div>

            <button
              type="submit"
              className="btn primary profile-save-btn"
              disabled={profileSaving || fullName.trim() === user?.full_name}
            >
              {profileSaving ? "Saving Changes..." : "Save Profile Details"}
            </button>
          </form>
        </section>

        {/* Change Password Form */}
        <section className="profile-section-card">
          <div className="card-header-with-icon">
            <div className="header-icon-badge amber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h3>Change Password</h3>
              <p className="card-subtitle">Ensure your account is protected with a strong password.</p>
            </div>
          </div>

          {passMsg && (
            <div className="profile-alert success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{passMsg}</span>
            </div>
          )}

          {passErr && (
            <div className="profile-alert error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{passErr}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="profile-form">
            <div className="form-group">
              <label htmlFor="current-password">Current Password</label>
              <div className="password-input-wrapper">
                <input
                  id="current-password"
                  type={showCurrentPass ? "text" : "password"}
                  value={passwords.currentPassword}
                  onChange={(e) => {
                    setPasswords((prev) => ({ ...prev, currentPassword: e.target.value }));
                    if (passErr) setPassErr(null);
                  }}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-icon"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  title={showCurrentPass ? "Hide password" : "Show password"}
                  tabIndex="-1"
                >
                  {showCurrentPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="new-password">New Password</label>
              <div className="password-input-wrapper">
                <input
                  id="new-password"
                  type={showNewPass ? "text" : "password"}
                  value={passwords.newPassword}
                  onChange={(e) => {
                    setPasswords((prev) => ({ ...prev, newPassword: e.target.value }));
                    if (passErr) setPassErr(null);
                  }}
                  placeholder="At least 6 characters"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-icon"
                  onClick={() => setShowNewPass(!showNewPass)}
                  title={showNewPass ? "Hide password" : "Show password"}
                  tabIndex="-1"
                >
                  {showNewPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-new-password">Confirm New Password</label>
              <div className="password-input-wrapper">
                <input
                  id="confirm-new-password"
                  type={showConfirmPass ? "text" : "password"}
                  value={passwords.confirmPassword}
                  onChange={(e) => {
                    setPasswords((prev) => ({ ...prev, confirmPassword: e.target.value }));
                    if (passErr) setPassErr(null);
                  }}
                  placeholder="Re-enter new password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-icon"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  title={showConfirmPass ? "Hide password" : "Show password"}
                  tabIndex="-1"
                >
                  {showConfirmPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn primary profile-save-btn"
              disabled={
                passSaving ||
                !passwords.currentPassword ||
                !passwords.newPassword ||
                !passwords.confirmPassword
              }
            >
              {passSaving ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        </section>
      </div>

      {/* Session Security Banner */}
      <div className="profile-security-box">
        <div className="security-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div className="security-content">
          <h4>Automatic Session Termination Enabled</h4>
          <p>
            Your login session is held strictly in temporary memory. When you close this browser tab or window,
            the CRM will automatically log you out. Re-launching the website will direct you back to the login page.
          </p>
        </div>
        <button
          type="button"
          className="btn ghost logout-now-btn"
          onClick={onLogout}
        >
          Log Out Now
        </button>
      </div>
    </div>
  );
}
