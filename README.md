# EMBSYS-CRM

Employee CRM application with Super Admin 2FA Email OTP Verification. React + Vite, FastAPI, SQLAlchemy, PostgreSQL.

```
empsys-crm/
├── backend/    FastAPI + SQLAlchemy + Pydantic
└── frontend/   React + Vite
```

## 1. Create the database (pgAdmin 4)
1. Open pgAdmin 4 and connect to your PostgreSQL server.
2. Right-click **Databases > Create > Database**, name it `empsys_crm`, and save.
   (Or run `CREATE DATABASE empsys_crm;` in the Query Tool.)
3. The `employees` table is created automatically when the backend starts.
   Refresh **empsys_crm > Schemas > public > Tables** to see it.

## 2. Run the backend
```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt
# Edit backend/.env and set DB_PASSWORD
uvicorn main:app --reload --port 8000
```
Swagger docs: http://localhost:8000/docs

## 3. Run the frontend
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /employees?search= | List / search employees |
| GET | /employees/{id} | Get one employee |
| POST | /employees | Create |
| PUT | /employees/{id} | Update |
| DELETE | /employees/{id} | Delete |
| GET | /dashboard | Totals and counts by department |
>>>>>>> 903615a (Implement Super Admin 2FA Email OTP login with Gmail SMTP delivery)
