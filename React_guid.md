# React Frontend Setup Guide

## 📁 File Structure

Your React app should have this structure:

```
frontend/  (or whatever you named your Vite project)
├── src/
│   ├── components/
│   │   └── InvoiceProcessor.jsx  ← Main component (copy from outputs)
│   ├── services/
│   │   └── api.js                ← API calls (copy from outputs)
│   ├── App.jsx                    ← Replace with our version
│   ├── App.css                    ← Keep your existing
│   └── main.jsx                   ← Keep your existing (Vite default)
├── package.json                   ← Update dependencies
└── vite.config.js                 ← Keep your existing
```

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Install Dependencies

```bash
cd frontend  # or your Vite project folder
npm install axios ag-grid-react ag-grid-community
```

### Step 2: Copy Files

Copy these files from `/outputs/react-app/` to your project:

1. **`src/services/api.js`** → Create this file
2. **`src/components/InvoiceProcessor.jsx`** → Create this file  
3. **`src/App.jsx`** → Replace your existing

### Step 3: Update API Base URL (if needed)

In `src/services/api.js`, line 3:

```javascript
const API_BASE_URL = 'http://localhost:8000';  // Your FastAPI URL
```

### Step 4: Start Development Server

```bash
npm run dev
```

Open: **http://localhost:5173**

---

## 🎯 Complete Workflow Test

### 1. Connect to Tally
- Enter company name: `Mr. Sanjay Mangabhai Gohel`
- Click "Connect to Tally"
- Should show: ✅ Connected with item/ledger counts

### 2. Upload JWT JSON
- Click "Choose File"
- Select your JWT JSON file
- Should parse and show invoices

### 3. Map Items
- See AG Grid with all items
- Yellow cells = unmapped (need attention)
- Dropdown shows Tally stock items
- Auto-suggestions pre-filled where available
- Edit units if needed
- Click "Save Mappings"

### 4. Generate XML
- After saving, "Download XML" button appears
- Click to download `purchase_PINV001.xml`
- Import in Tally: Gateway → Import → Vouchers

---

## 🎨 Features

### AG Grid Capabilities
- ✅ **Inline editing** - Click cell to edit
- ✅ **Dropdown selection** - For stock items and units
- ✅ **Visual indicators** - Yellow = unmapped
- ✅ **Sortable columns** - Click header to sort
- ✅ **Filterable** - Search/filter data
- ✅ **Resizable columns** - Drag column borders

### Smart Suggestions
- 🟢 **Exact match (100%)** - Auto-filled, saved before
- 🟡 **Fuzzy match (75%+)** - Similar product name
- 🟠 **Tally exact (90%)** - JSON desc exists in Tally
- ⚪ **No match (0%)** - User must select manually

### Workflow Steps
1. **Connect** → Fetches Tally masters
2. **Upload** → Parses JWT JSON
3. **Map** → AG Grid with suggestions
4. **Generate** → Download XML

---

## 📊 AG Grid Columns

| Column | Editable | Description |
|--------|----------|-------------|
| JSON Description | No | From e-invoice |
| Tally Stock Item | ✅ Yes | Dropdown selection |
| Quantity | No | From e-invoice |
| JSON Unit | No | Unit from e-invoice |
| Tally Unit | ✅ Yes | Dropdown selection |
| Rate | No | From e-invoice |
| Amount | No | Calculated |
| GST % | No | From e-invoice |
| Suggestion | No | Confidence indicator |

---

## 🐛 Troubleshooting

### Error: "Network Error"
**Problem:** Can't connect to FastAPI

**Solution:**
1. Check FastAPI is running: `http://localhost:8000/docs`
2. Check CORS is configured in FastAPI `main.py`
3. Verify API_BASE_URL in `api.js`

### Error: "CORS policy" in browser console
**Problem:** FastAPI not allowing React requests

**Solution:**
In FastAPI `main.py`, add React URL to origins:
```python
origins = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",  # CRA dev server
]
```

### AG Grid not showing
**Problem:** Missing CSS imports

**Solution:**
Add to `InvoiceProcessor.jsx`:
```javascript
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
```

### Tally connection fails
**Problem:** Tally not responding

**Solution:**
1. Check Tally is running
2. Enable ODBC: F12 → Advanced → ODBC Server = Yes
3. Port = 9000
4. Company is open

---

## 🎨 Styling (Optional)

### Make it look better:

**1. Add to `src/App.css`:**
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.App {
  background: white;
  min-height: 100vh;
}

button {
  transition: all 0.3s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

button:disabled {
  opacity: 0.6;
}
```

**2. Add icons:**
```bash
npm install lucide-react
```

Then in components:
```javascript
import { Upload, CheckCircle, Download } from 'lucide-react';
```

---

## 🚀 Next Steps

Once basic flow works:

### Phase 1: Enhanced UX
- [ ] Loading spinners
- [ ] Progress indicators
- [ ] Success/error toasts
- [ ] Confirmation dialogs

### Phase 2: Advanced Features
- [ ] Multiple invoice selection
- [ ] Bulk XML generation
- [ ] Mapping history view
- [ ] Rate comparison alerts

### Phase 3: Production
- [ ] Django authentication
- [ ] User-specific companies
- [ ] Mapping analytics
- [ ] Export/import mappings

---

## 📸 Expected Screens

### Screen 1: Connect to Tally
```
┌────────────────────────────────────┐
│ Step 1: Connect to Tally           │
│                                    │
│ [Enter Company Name________] [Connect] │
└────────────────────────────────────┘
```

### Screen 2: Upload JSON
```
┌────────────────────────────────────┐
│ Step 2: Upload JWT JSON File       │
│                                    │
│ ✅ Connected to: My Company        │
│ 📦 Stock Items: 1,234             │
│ 📒 Ledgers: 567                   │
│                                    │
│ [Choose File...]                   │
└────────────────────────────────────┘
```

### Screen 3: Mapping Grid
```
┌────────────────────────────────────────────────────────────┐
│ Invoice: PINV001 - ABC Suppliers - ₹12,400.00             │
├────────────────────────────────────────────────────────────┤
│ JSON Desc    │ Tally Item  │ Qty │ Unit │ Rate │ Amount   │
├──────────────┼─────────────┼─────┼──────┼──────┼──────────┤
│ Product A    │ [Dropdown▼] │ 100 │ Nos  │ 65   │ 6,500   │
│ Product B    │ Item B ✓    │ 50  │ Kgs  │ 100  │ 5,000   │
└────────────────────────────────────────────────────────────┘
           [Save Mappings]  [Download XML]
```

---

## ✅ Success Checklist

- [ ] FastAPI running on :8000
- [ ] React running on :5173
- [ ] Can connect to Tally
- [ ] Can upload JSON file
- [ ] AG Grid displays items
- [ ] Can edit cells
- [ ] Dropdowns work
- [ ] Suggestions appear
- [ ] Can save mappings
- [ ] Can download XML
- [ ] XML imports to Tally

---

## 🎉 You're Ready!

Your complete stack:
- ✅ **Django** - Database & Auth
- ✅ **FastAPI** - Processing & Tally
- ✅ **React** - Beautiful UI
- ✅ **AG Grid** - Excel-like editing
- ✅ **Tally** - Final destination

**Transform 1 day → 1 hour!** 🚀