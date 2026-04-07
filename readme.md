# EInvoice Pro — GST e-Invoice to Tally ERP Automation

> Full-stack SaaS platform that decodes Government e-Invoice signed JSON (IRN) and automatically pushes Purchase Vouchers into Tally Prime — reducing invoice processing from **3-4 hours/day to under 60 seconds**.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![Django](https://img.shields.io/badge/Django-092E20?style=flat&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)

---

## What It Does

Accounting teams spend hours manually downloading e-Invoices from the Government portal and entering them into Tally line by line. EInvoice Pro eliminates that entirely.

**3-step workflow:**
1. **Upload** — Import Government e-Invoice signed JSON (IRN format)
2. **Map** — Link supplier company and line items to Tally masters (saved in DB — configure once, auto-maps forever)
3. **Push** — Preview XML → Download XML → Export Excel → or Push directly to Tally ERP in one click

---

## Screenshots
![Auth](<img width="789" height="558<img width="789" height="558" alt="Screenshot 2026-04-04 123159" src="https://github.com/user-attachments/assets/461e5aa5-4181-42e9-a5ff-6691a0acea65" />
" alt="image" src="https://github.com/user-attachments/assets/9f90ecfc-eaa0-4b28-886d-4ef99c471daf" />
)

> Email OTP authentication

> Upload and decode multiple invoices at once

![Invoice List](screenshots/invoice-list.png)

> Smart item mapping with party, ledger, and GST configuration

![Item Mapping](screenshots/item-mapping.png)

> Company connection via Tally Prime

![Companies](screenshots/companies.png)



---

## Features

- **JWT/IRN Decoding** — Decodes digitally signed Government e-Invoice JSON payloads
- **Auto GST Detection** — Detects Intrastate (CGST+SGST) vs Interstate (IGST) and supplier state from GSTIN
- **Smart Item Mapping** — Fuzzy match + exact match suggestions; mappings saved in PostgreSQL for reuse
- **Tally Prime Integration** — Sends Purchase Voucher XML directly to Tally via HTTP API
- **Multi-format Export** — Preview XML, Download XML, Export to Excel
- **Bulk Processing** — Process 17+ invoices in a single session
- **Audit Trail** — All invoices and mappings stored in PostgreSQL for compliance
- **Freight & Charges** — Handles additional charges and ledger assignment

---

## Business Impact

- Reduced invoice processing: **3-4 hours/day → under 60 seconds**
- **Zero** manual data entry errors
- Smart mapping memory — repeat supplier invoices need **zero re-configuration**
- Used in production at an accounting

---

## Architecture

```
React Frontend (Port 3000)
        ↓  HTTP / REST
FastAPI Backend (Port 8001)  ←→  Django ORM + PostgreSQL
        ↓  HTTP / XML
  Tally Prime (Port 9000)
        ↑
  Govt e-Invoice JSON (IRN)
```

**Mapping Intelligence:**
```
User maps: "SAVAJ DAIRY MILK" → "Milk 500ml PKT"
    ↓ saved to PostgreSQL
Next invoice from same supplier
    ↓
Auto-suggested with 100% confidence — no re-mapping needed
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Django REST Framework |
| Frontend | React.js |
| Database | PostgreSQL |
| ERP Integration | Tally Prime HTTP/XML API |
| Auth | Email OTP (6-digit code) |
| Invoice Parsing | Government e-Invoice IRN/JWT decoding |

---

## Project Structure

```
fastapi_app/
├── main.py                      # FastAPI entry point
├── core/
│   └── database.py              # PostgreSQL connection
├── api/
|   ├── auth_routs.py            # Auth endpoints
│   ├── companies_routs.py       # Companies endpoints
│   ├── tally_routes.py          # Tally endpoints
│   ├── settings_routs.py        # Setting endpoints
│   ├── invoice_routes.py        # Invoice processing
│   ├── mapping_routes.py        # Mapping suggestions
│   └── voucher_routes.py        # XML generation
├── services/
│   ├── tally_connector.py       # Tally XML communication
│   ├── invoice_processor.py     # JWT decoding
│   ├── mapping_service.py       # Smart suggestions
│   └── tally_encoder.py         # Purchase XML builder
|   └── otp_service.py           # Otp Generator
|   └── excel_download_service.py# Download Excel Of Invoices
└── schemas/
    └── invoice_schemas.py       # Pydantic models
```

---

## Quick Start

### 1. Clone and install

```bash
# 1. Clone the repository and navigate into it
git clone https://github.com/Nidhi-Zalavadiya/Tally_Automation.git
cd Tally_Automation

# 2. Create the virtual environment (named 'myenv')
python -m venv myenv

# 3. Activate the virtual environment
# ---> If you are on Windows:
myenv\Scripts\activate
# ---> If you are on macOS/Linux:
source myenv/bin/activate

# 4. Install the required dependencies
pip install -r requirements.txt
```

### 2. Configure environment

Create a `.env` file in the project root (see `.env.example`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tally_automation_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password
TALLY_URL=http://localhost:9000
```

> ⚠️ Never commit your `.env` file. It is already in `.gitignore`.

### 3. Start Tally Prime

1. Open Tally Prime with your company
2. Press `F12` → Advanced Configuration
3. Set ODBC Server to `Yes`, Port: `9000`

### 4. Run the server

```bash
uvicorn fastapi_app.main:app --reload --port 8000
```

API docs available at: **http://localhost:8000/docs**

---

## API Endpoints

### Authentication (`/api/auth`)
```text
POST   /api/auth/signup              Create account and send email OTP
POST   /api/auth/login               Verify credentials and get JWT token
GET    /api/auth/me                  Get current authenticated user session
GET    /api/auth/profile             Get full user profile details (dates, verification status)
PUT    /api/auth/profile             Update profile information (name, phone)
POST   /api/auth/verify-otp          Verify 6-digit OTP code from email
POST   /api/auth/resend-otp          Resend verification email OTP
```

### Companies (`/api/companies`)
```text
GET    /api/companies/               List all connected companies for the current user
POST   /api/companies/connect        Connect to Tally, fetch masters, and save company to DB
POST   /api/companies/{id}/refresh   Refresh masters (ledgers/items/units) without full reconnect
DELETE /api/companies/{id}           Disconnect and remove company from DB
```

### Tally Operations (`/api/tally`)
```text
POST   /api/tally/connect            Connect to Tally and fetch all masters
GET    /api/tally/item/{name}        Get detailed information for a specific stock item
POST   /api/tally/send-voucher       Send voucher XML directly to Tally for import
```

### Invoice Processing (`/api/invoices`)
```text
POST   /api/invoices/parse           Parse uploaded Government e-Invoice IRN/JWT JSON file
POST   /api/invoices/parse-text      Parse invoice JSON directly from the request body
```

### Mapping & Suggestions (`/api/mappings`)
```text
POST   /api/mappings/suggest         Get smart mapping suggestion for a single product
POST   /api/mappings/save            Save a new product mapping to the database
GET    /api/mappings/company/{id}    Get all saved mappings for a specific company
POST   /api/mappings/bulk-suggest    Get bulk suggestions for multiple products at once
```

### Settings & State (`/api/settings`)
```text
GET    /api/settings/                Load user's saved ledger configurations and voucher types
POST   /api/settings/save            Save ledger config, rate-wise ledgers, and voucher types
GET    /api/settings/invoices        Load user's temporarily saved invoice list session
POST   /api/settings/invoices        Save current invoice list and mapping status
DELETE /api/settings/invoices        Clear saved invoices (Start Fresh)
```

### Voucher Generation (`/api/vouchers`)
```text
POST   /api/vouchers/generate          Generate Tally Purchase XML
POST   /api/vouchers/generate-and-send Generate and push directly to Tally
POST   /api/vouchers/download          Generate and download a single XML file
POST   /api/vouchers/download-bulk     Generate and download a bulk XML file for multiple invoices
POST   /api/vouchers/download_excel    Download parsed invoices report in Excel format
```

---

## Troubleshooting

| Error | Solution |
|---|---|
| Cannot connect to Tally | Check Tally is running, ODBC enabled on port 9000 |
| Database connection failed | Verify `.env` credentials, check PostgreSQL is running |
| ModuleNotFoundError | Run `pip install -r requirements.txt` |
| Address already in use | Kill process: `lsof -ti:8000 \| xargs kill -9` |

---

## Environment Example

```env
# .env.example — copy to .env and fill in your values
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tally_automation_db
DB_USER=postgres
DB_PASSWORD=your_password_here
TALLY_URL=http://localhost:9000
CORS_ORIGINS=http://localhost:3000
```

---

## Author

**Nidhi Zalavadiya** — Python Full-Stack Developer  
📍 Gujarat, India  
💼 [LinkedIn](https://linkedin.com/in/nidhizavalaiya) · 🐙 [GitHub](https://github.com/Nidhi-Zalavadiya)  
📧 nidhizalavadiya2707@gmail.com
