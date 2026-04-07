
```markdown
# 🚀 EInvoice Pro: Local Development Setup Guide

This guide walks you through setting up the complete EInvoice Pro stack on your local machine, including the backend API, frontend UI, database, and Tally Prime connection.

## 📋 Prerequisites
Before you begin, ensure you have the following installed:
* **Python 3.9+**
* **Node.js 18+** & npm
* **PostgreSQL 13+**
* **Tally Prime** (installed and licensed/educational version)
* **Git**

---

## 🗄️ Phase 1: Database Setup (PostgreSQL)

1. Open your PostgreSQL terminal (psql) or pgAdmin.
2. Create a new database for the application:
   ```sql
   CREATE DATABASE tally_automation_db;
   ```
3. Ensure you have your PostgreSQL user credentials (username and password) handy for the backend configuration.

---

## ⚙️ Phase 2: Backend Setup (FastAPI)

The backend handles JWT parsing, database operations, and the direct XML bridge to Tally Prime.

### 1. Clone & Initialize
```bash
git clone [https://github.com/Nidhi-Zalavadiya/Tally_Automation.git](https://github.com/Nidhi-Zalavadiya/Tally_Automation.git)
cd Tally_Automation
```

### 2. Create Virtual Environment
```bash
python -m venv myenv

# Windows
myenv\Scripts\activate
# Mac/Linux
source myenv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Environment Variables
Create a `.env` file in the root directory and add the following configuration:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tally_automation_db
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Authentication
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE_HOURS=168

# Tally Integration
TALLY_URL=http://localhost:9000
```

### 5. Run Database Migrations
*(Assuming Django ORM is used alongside FastAPI for models as indicated in your stack)*
```bash
python manage.py migrate
```

### 6. Start the FastAPI Server
```bash
uvicorn fastapi_app.main:app --reload --port 8000
```
✅ **Success Check:** Open `http://localhost:8000/docs` in your browser. You should see the Swagger UI with all API endpoints listed.

---

## 📊 Phase 3: Tally Prime Configuration

For the backend to communicate with Tally, you must enable Tally's ODBC server.

1. Open **Tally Prime** and load your target Company.
2. Press `F12` (Configure) -> Go to **Advanced Configuration**.
3. Under the *Client/Server Configuration* section:
   * Set **Enable ODBC Server** to `Yes`.
   * Set **Port** to `9000`.
4. Save the configuration and restart Tally Prime if prompted.
5. Ensure your target company is actively open on the Tally screen.

---

## 💻 Phase 4: Frontend Setup (React)

The React frontend provides the mapping UI, AG Grid integration, and file upload handlers.

### 1. Navigate to the Frontend Directory
```bash
# Open a new terminal window
cd Tally_Automation/frontend
```

### 2. Install Node Modules
```bash
npm install axios ag-grid-react ag-grid-community lucide-react
```

### 3. Configure API Connection
Ensure your frontend is pointing to the correct local FastAPI server. In `src/services/api.js` (or your relevant config file), verify the base URL:
```javascript
export const API_BASE_URL = 'http://localhost:8000';
```

### 4. Start the Development Server
```bash
npm run dev
```
✅ **Success Check:** Open `http://localhost:5173` (or port 3000 depending on your bundler). You should see the EInvoice Pro login/dashboard screen.

---

## 🎯 Phase 5: Testing the Full Loop

To verify the entire system is working together:

1. **Check Tally Connection:** In the frontend UI, enter your open Tally Company Name and click "Connect". It should successfully fetch your ledgers and stock items.
2. **Upload an Invoice:** Upload a sample Government e-Invoice JSON (IRN format).
3. **Map Items:** Use the AG Grid interface to map an uploaded item to a Tally stock item.
4. **Push XML:** Click the export/send button. Check Tally Prime (Gateway -> Day Book) to verify the Purchase Voucher was successfully generated!

---

## 🐛 Troubleshooting Common Issues

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **CORS Policy Error** | React cannot talk to FastAPI | Ensure `http://localhost:5173` (or 3000) is in the `origins` list in `main.py`. |
| **Database Connection Failed** | Invalid `.env` credentials | Double-check your `DB_PASSWORD` and `DB_USER` in the backend `.env` file. |
| **Tally Connection Error (503)** | Tally is closed or wrong port | Verify Tally Prime is open, the company is loaded, and ODBC is running on port 9000. |
| **Address Already in Use** | Port 8000 or 5173 is busy | Kill the process holding the port or restart your machine. |
```
