# app/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api.v1 import api_router as api_router_v1
# from app.core.config import settings # If needed globally

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="COST - Cloud Overall Spend Tracker API",
    description="API for tracking Azure cloud spending using azure-mgmt-costmanagement==3.0.0",
    version="v2.0.1"
)

# CORS Configuration
# Allows requests from your React frontend (which will run on a different port during development)
origins = [
    "http://localhost",      # Common for local dev, if backend and frontend are on same host but different ports
    "http://localhost:3000", # Default for create-react-app
    # Add your production frontend URL(s) here once deployed
    "https://cost.dev.ai.army.mil"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": "An unexpected internal server error occurred.", "detail": str(exc)},
    )

@app.on_event("startup")
async def startup_event():
    logger.info("COST API starting up...")
    # logger.info(f"Azure App Client ID configured: {'Yes' if settings.AZURE_APP_CLIENT_ID else 'No'}")
    # logger.info(f"Azure Authority Host: {settings.AZURE_AUTHORITY_HOST}")
    # logger.info(f"Azure RM Endpoint: {settings.AZURE_RESOURCE_MANAGER_ENDPOINT}")
    # logger.info(f"Azure RM Audience: {settings.AZURE_RESOURCE_MANAGER_AUDIENCE}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("COST API shutting down...")

# Include your API router
app.include_router(api_router_v1, prefix="/i/api/v1")

@app.get("/", summary="Root Endpoint")
async def read_root():
    return {"message": "Welcome to COST API v2. Navigate to /docs for API documentation."}