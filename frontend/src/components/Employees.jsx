import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import EmployeeForm from "./EmployeeForm.jsx";

const money = (n) =>
  Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function Employees({ user }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = new, employee = edit

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const load = useCallback(async (term) => {
    setLoading(true);
    setError("");
    try {
      setEmployees(await api.getEmployees(term));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search: re-query the API shortly after typing stops.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  async function save(data) {
    if (!isSuperAdmin) {
      setError("Permission denied: Only the designated Super Admin can add or edit employees.");
      setEditing(null);
      return;
    }
    try {
      if (editing.employee_id) await api.updateEmployee(editing.employee_id, data);
      else await api.createEmployee(data);
      setEditing(null);
      load(search);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(emp) {
    if (!isSuperAdmin) {
      setError("Permission denied: Only the designated Super Admin can delete employees.");
      return;
    }
    if (!window.confirm(`Delete ${emp.first_name} ${emp.last_name}? This cannot be undone.`)) return;
    try {
      await api.deleteEmployee(emp.employee_id);
      load(search);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Employees</h1>
          <p className="muted">{employees.length} shown</p>
        </div>
        {isSuperAdmin ? (
          <button className="btn primary" onClick={() => setEditing({})}>
            Add employee
          </button>
        ) : (
          <div className="view-only-badge" title="Only the Super Admin can add or edit employees">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>View Only Mode</span>
          </div>
        )}
      </header>

      <input
        className="search"
        type="search"
        placeholder="Search by name, code, email, department or designation"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <div className="alert">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Joined</th>
              <th className="num">Salary</th>
              <th>Status</th>
              <th className="row-actions-th">{isSuperAdmin ? "Actions" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.employee_id}>
                <td>{e.employee_code}</td>
                <td>
                  <div className="name">
                    {e.first_name} {e.last_name}
                  </div>
                  <div className="muted small">{e.email}</div>
                </td>
                <td>{e.department}</td>
                <td>{e.designation}</td>
                <td>{e.joining_date}</td>
                <td className="num">{money(e.salary)}</td>
                <td>
                  <span className={`pill ${e.employment_status === "Active" ? "on" : "off"}`}>
                    {e.employment_status}
                  </span>
                </td>
                <td className="row-actions">
                  {isSuperAdmin ? (
                    <>
                      <button className="link" onClick={() => setEditing(e)}>
                        Edit
                      </button>
                      <button className="link danger" onClick={() => remove(e)}>
                        Delete
                      </button>
                    </>
                  ) : (
                    <span className="no-perm-label" title="Only the Super Admin can edit or delete">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan="8" className="empty">
                  {search
                    ? "No employees match your search."
                    : isSuperAdmin
                    ? "No employees yet. Select Add employee to create the first one."
                    : "No employees found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="muted pad">Loading…</p>}
      </div>

      {editing && isSuperAdmin && (
        <EmployeeForm
          employee={editing.employee_id ? editing : null}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
