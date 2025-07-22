from fastapi.security import OAuth2PasswordBearer

# OAuth2 scheme for Bearer token authentication
# The tokenUrl is a dummy here as token acquisition is handled by the frontend (MSAL).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")