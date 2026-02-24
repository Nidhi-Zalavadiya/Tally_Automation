from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator

# Use your exact Postgres details from Django settings
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Nidhi@localhost:5432/tally_automation_db"

# Create SQLAlchemy engine
# pool_pre_ping=True ensures connections are valid before using them
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo = True, # Set to True for SQL query debugging
    pool_pre_ping = True
    )

# Session factory for creating database sessions
SessionLocal = sessionmaker(autoflush=False, autocommit=False, bind=engine)

# Base class for declarative models (not used much since we use Django models)
Base = declarative_base()

def get_db() -> Generator:
    '''
    Dependency function for FastAPI routes.
    
    Usage in routes:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            # Use db here
    
    Automatically closes the session after the request.
    '''
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()