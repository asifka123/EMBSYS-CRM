import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard…</p>;

  const max = Math.max(1, ...data.by_department.map((d) => d.count));

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">A snapshot of your workforce.</p>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Total employees</span>
          <span className="stat-value">{data.total_employees}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Active</span>
          <span className="stat-value teal">{data.active_employees}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Inactive</span>
          <span className="stat-value amber">{data.inactive_employees}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Employees by department</h2>
        {data.by_department.length === 0 ? (
          <p className="muted">No employees yet. Add one from the Employees page.</p>
        ) : (
          <ul className="bars">
            {data.by_department.map((d) => (
              <li key={d.department}>
                <span className="bar-label">{d.department}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
                </span>
                <span className="bar-count">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
