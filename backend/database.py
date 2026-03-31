# database.py
# This file sets up the database connection and gives us a session to talk to it

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

# Load variables from .env file
load_dotenv()

# Get the database URL from .env (defaults to SQLite if not set)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./damage_analyzer.db")

# Create the database engine
# connect_args is needed only for SQLite (allows multiple threads)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True  # checks connection is alive before using it
)

# SessionLocal is a factory — each request gets its own session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class that all our models will inherit from
class Base(DeclarativeBase):
    pass

# Dependency used in FastAPI routes
# Gives a DB session to each request, then closes it when done
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()