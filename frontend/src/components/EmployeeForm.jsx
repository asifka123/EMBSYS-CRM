import { useState } from "react";

const EMPTY = {
  employee_code: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  joining_date: "",
  salary: "",
  employment_status: "Active",
};

export default function EmployeeForm({ employee, onSave, onCancel }) {
  const [form, setForm] = useState(
    employee
      ? {
          employee_code: employee.employee_code,
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          phone: employee.phone,
          department: employee.department,
          designation: employee.designation,
          joining_date: employee.joining_date,
          salary: employee.salary,
          employment_status: employee.employment_status,
        }
      : EMPTY
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, salary: Number(form.salary) });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{employee ? "Edit employee" : "Add employee"}</h2>

        {error && <div className="alert">{error}</div>}

        <div className="grid">
          <label>
            Employee code
            <input required value={form.employee_code} onChange={set("employee_code")} placeholder="EMP001" />
          </label>
          <label>
            Status
            <select value={form.employment_status} onChange={set("employment_status")}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
          <label>
            First name
            <input required value={form.first_name} onChange={set("first_name")} />
          </label>
          <label>
            Last name
            <input required value={form.last_name} onChange={set("last_name")} />
          </label>
          <label>
            Email
            <input required type="email" value={form.email} onChange={set("email")} />
          </label>
          <label>
            Phone
            <input required value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
          </label>
          <label>
            Department
            <input required value={form.department} onChange={set("department")} placeholder="Engineering" />
          </label>
          <label>
            Designation
            <input required value={form.designation} onChange={set("designation")} />
          </label>
          <label>
            Joining date
            <input required type="date" value={form.joining_date} onChange={set("joining_date")} />
          </label>
          <label>
            Salary
            <input required type="number" min="0" step="0.01" value={form.salary} onChange={set("salary")} />
          </label>
        </div>

        <div className="actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : employee ? "Save changes" : "Add employee"}
          </button>
        </div>
      </form>
    </div>
  );
}
