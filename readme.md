# ERP Integration Platform - FastAPI Backend

## 🎯 Overview

Production-grade FastAPI backend for E-Invoice to Tally Prime conversion platform.

**Features:**
- ✅ JWT invoice parsing (GST e-invoices)
- ✅ Tally Prime integration (localhost:9000)
- ✅ Smart product mapping with suggestions
- ✅ Purchase voucher XML generation
- ✅ Multi-invoice bulk processing
- ✅ PostgreSQL persistence

---

## 📁 Project Structure

```
fastapi_app/
├── main.py                      # FastAPI entry point
├── core/
│   └── database.py              # PostgreSQL connection
├── api/
│   ├── tally_routes.py          # Tally endpoints
│   ├── invoice_routes.py        # Invoice processing
│   ├── mapping_routes.py        # Mapping suggestions
│   └── voucher_routes.py        # XML generation
├── services/
│   ├── tally_connector.py       # Tally XML communication
│   ├── invoice_processor.py     # JWT decoding
│   ├── mapping_service.py       # Smart suggestions
│   └── voucher_builder.py       # Purchase XML builder
└── schemas/
    └── invoice_schemas.py       # Pydantic models
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 2. Configure Database

Your Django database is already set up. FastAPI uses the same PostgreSQL database.

**Database credentials** (from your Django settings):
- Host: `localhost`
- Port: `5432`
- Database: `tally_automation_db`
- User: `postgres`
- Password: `Nidhi`

### 3. Start Tally Prime

**IMPORTANT:** Before starting the API, make sure:
1. Tally Prime is running
2. ODBC server is enabled on port 9000
3. Your company is open in Tally

**Enable ODBC in Tally:**
- Press `F12` (Configure)
- Go to Advanced Configuration
- Set "ODBC Server" to `Yes`
- Port: `9000`

### 4. Run FastAPI Server

```bash
# From project root directory
uvicorn fastapi_app.main:app --reload --port 8000
```

You should see:
```
🚀 FastAPI server starting...
📖 API Documentation: http://localhost:8000/docs
🔌 Tally connection: localhost:9000
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 5. Test the API

Open browser: **http://localhost:8000/docs**

You'll see Swagger UI with all endpoints ready to test!

---

## 📡 API Endpoints

### Tally Operations

```
POST   /api/tally/connect
       Connect to Tally and fetch masters (Ledgers, Stock Items, Units)

GET    /api/tally/item/{item_name}
       Get specific item details (rate, MRP, unit)

POST   /api/tally/send-voucher
       Send voucher XML to Tally for import
```

### Invoice Processing

```
POST   /api/invoices/parse
       Parse uploaded JWT JSON file

POST   /api/invoices/parse-text
       Parse invoice data sent as JSON body
```

### Mapping & Suggestions

```
POST   /api/mappings/suggest
       Get mapping suggestion for a product

POST   /api/mappings/save
       Save a new mapping

GET    /api/mappings/company/{company_id}
       Get all mappings for a company

POST   /api/mappings/bulk-suggest
       Get suggestions for multiple products at once
```

### Voucher Generation

```
POST   /api/vouchers/generate
       Generate Tally Purchase voucher XML

POST   /api/vouchers/generate-and-send
       Generate XML and send to Tally immediately

POST   /api/vouchers/download
       Generate XML and download as file
```

---

## 🧪 Testing the Workflow

### Test 1: Connect to Tally

```bash
curl -X POST "http://localhost:8000/api/tally/connect" \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Your Company Name"}'
```

**Expected Response:**
```json
{
  "company_name": "Your Company Name",
  "ledgers": ["Ledger1", "Ledger2", ...],
  "stock_items": ["Item1", "Item2", ...],
  "units": ["Nos", "Kgs", ...],
  "message": "Successfully connected to Your Company Name"
}
```

### Test 2: Parse Invoice (Using Swagger UI)

1. Go to http://localhost:8000/docs
2. Find `POST /api/invoices/parse`
3. Click "Try it out"
4. Upload your JWT JSON file
5. Click "Execute"

### Test 3: Get Mapping Suggestion

```bash
curl -X POST "http://localhost:8000/api/mappings/suggest" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": 1,
    "json_description": "Apple iPhone 15",
    "tally_items": ["iPhone 15", "iPhone 15 Pro", "Samsung Galaxy"]
  }'
```

### Test 4: Generate Voucher

Use Swagger UI at `/docs` - it's easier for complex requests!

---

## 🔧 Configuration

### Database Connection

Edit `fastapi_app/core/database.py` if you need to change database credentials:

```python
DATABASE_URL = "postgresql://postgres:Nidhi@localhost:5432/tally_automation_db"
```

### Tally URL

Edit `fastapi_app/services/tally_connector.py` if Tally is on a different port:

```python
TALLY_URL = "http://localhost:9000"  # Change port if needed
```

### CORS Origins

Edit `fastapi_app/main.py` to allow different frontend URLs:

```python
origins = [
    "http://localhost:3000",  # Add your React app URL
]
```

---

## 🐛 Troubleshooting

### Error: "Cannot connect to Tally"

**Solutions:**
1. Check if Tally Prime is running
2. Verify ODBC server is enabled (`F12` → Advanced → ODBC Server = Yes)
3. Confirm port 9000 is not blocked by firewall
4. Make sure a company is open in Tally

### Error: "Database connection failed"

**Solutions:**
1. Check PostgreSQL is running
2. Verify credentials in `database.py`
3. Test connection: `psql -U postgres -d tally_automation_db`

### Error: "ModuleNotFoundError"

**Solution:**
```bash
pip install -r requirements.txt
```

### Error: "Address already in use"

**Solution:**
```bash
# Kill process on port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:8000 | xargs kill -9
```

---

## 🎓 How It Works (Architecture Explanation)

### 1. Tally Communication Flow

```
React Frontend
    ↓ (HTTP Request)
FastAPI Backend
    ↓ (XML Request)
Tally Prime localhost:9000
    ↓ (XML Response)
FastAPI Backend
    ↓ (JSON Response)
React Frontend
```

### 2. Mapping Intelligence

```
User Maps: "Apple iPhone" → "iPhone 15 Pro"
    ↓
Saved to PostgreSQL (companies_productmapping table)
    ↓
Next time "Apple iPhone" appears
    ↓
System auto-suggests "iPhone 15 Pro" (confidence: 100%)
```

### 3. Smart Suggestion Algorithm

1. **Exact Match**: Checks if product was mapped before
2. **Fuzzy Match**: Finds similar product names (>75% similarity)
3. **Tally Exact**: Checks if JSON description exists in Tally
4. **No Match**: User manually selects from dropdown

---

## 🚀 Next Steps

Now that your backend is running:

1. **Test all endpoints** using Swagger UI
2. **Set up React frontend** (I'll help with this next)
3. **Build AG Grid** for item mapping
4. **Integrate with Django auth** (optional)

---

## 📞 Need Help?

If you encounter issues:
1. Check the console logs
2. Review Swagger UI docs at `/docs`
3. Test Tally connection directly
4. Verify database tables exist

---

## 🎉 Success Checklist

- [ ] FastAPI server running on port 8000
- [ ] Swagger UI accessible at /docs
- [ ] Tally Prime running with ODBC enabled
- [ ] Database connection working
- [ ] Can fetch Tally masters successfully
- [ ] Can parse JWT invoices
- [ ] Mapping suggestions working
- [ ] XML generation successful

Once all checked, you're ready for frontend integration! 🚀