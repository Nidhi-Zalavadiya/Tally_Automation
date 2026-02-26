"""
FastAPI Main Application.

This is the entry point for your FastAPI backend.
Run with: uvicorn fastapi_app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import tally_routs, invoice_routs, mapping_routs, voucher_routs,auth_routs,companies_routs

# Create FastAPI app
app = FastAPI(
    title="ERP Integration Platform API",
    description="Backend API for E-Invoice to Tally Prime conversion",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI at http://localhost:8000/docs
    redoc_url="/redoc"  # ReDoc at http://localhost:8000/redoc
)


# ===== CORS Configuration =====
# Allows React frontend to make requests to FastAPI

origins = [
    "http://localhost:3000",  # React dev server
    "http://localhost:5173",  # Vite dev server
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Which origins can access the API
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)


# ===== Global Exception Handler =====

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Catch any unhandled exceptions and return a consistent error response.
    """
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc)
        }
    )


# ===== Health Check Endpoint =====

@app.get("/", tags=["Health"])
async def root():
    """
    Health check endpoint.
    """
    return {
        "message": "ERP Integration Platform API is running",
        "version": "1.0.0",
        "status": "healthy"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Detailed health check.
    """
    return {
        "status": "healthy",
        "api": "online",
        "database": "connected"  # You can add actual DB check here
    }


# ===== Register Route Modules =====

app.include_router(auth_routs.router)
app.include_router(companies_routs.router)
app.include_router(tally_routs.router)      # /api/tally/*
app.include_router(invoice_routs.router)    # /api/invoices/*
app.include_router(mapping_routs.router)    # /api/mappings/*
app.include_router(voucher_routs.router)    # /api/vouchers/*



# ===== Startup/Shutdown Events =====

@app.on_event("startup")
async def startup_event():
    """
    Runs when FastAPI server starts.
    """
    print("🚀 FastAPI server starting...")
    print("📖 API Documentation: http://localhost:8000/docs")
    print("🔌 Tally connection: localhost:9000")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Runs when FastAPI server shuts down.
    """
    print("🛑 FastAPI server shutting down...")


# 🎓 MENTOR NOTE:
# - FastAPI automatically generates OpenAPI docs at /docs
# - CORS middleware is essential for React to communicate with FastAPI
# - include_router() registers all endpoints from route modules
# - Health check endpoints help monitor server status
# - Startup events are useful for initialization tasks

# To run this app:
# 1. Navigate to project root
# 2. Run: uvicorn fastapi_app.main:app --reload --port 8000
# 3. API will be available at http://localhost:8000
# 4. Docs at http://localhost:8000/docs