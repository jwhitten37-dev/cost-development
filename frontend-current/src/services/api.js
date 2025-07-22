import axios from 'axios';
import { PublicClientApplication, LogLevel, InteractionRequiredAuthError } from '@azure/msal-browser';

// Determine the API base URL
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/i/api/v1';

/**
 * MSAL Configuration
 * For more details, visit: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: process.env.REACT_APP_AZURE_APP_CLIENT_ID,
        authority: process.env.REACT_APP_AZURE_AUTHORITY,
        redirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin, // Defaults to window.location.origin if not set
        postLogoutRedirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
        navigateToLoginRequestUrl: false, // If "true", will navigate back to the original request location before processing the auth code response.
    },
    cache: {
        cacheLocation: "sessionStorage", // "localStorage" or "sessionStorage" or "memoryStorage"
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) {
                    return;
                }
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        // console.info(message); // Can be too verbose
                        return;
                    case LogLevel.Verbose:
                        // console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                    default:
                        return;
                }
            }
        }
    }
};

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// MSAL Initialization function
let msalInitialized = false;
export const initializeMsal = async () => {
    if (!msalInitialized) {
        try {
            await msalInstance.initialize();
            msalInitialized = true;
        } catch (error) {
            console.error("MSAL initialization failed:", error);
            throw error; // Re-throw to allow App.js to handle
        }
    }
};

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add bearer token
apiClient.interceptors.request.use(
    async (config) => {
        if (!msalInitialized) {
            console.warn("MSAL not initialized. Waiting for initialization before acquiring token.");
            await initializeMsal(); // Ensure initialization before proceeding
        }

        const account = msalInstance.getActiveAccount();
        if (!account) {
            // If no active account, the request will proceed without a token.
            // The backend should handle this (e.g., return 401).
            // UI components should initiate login if this happens.
            console.warn("No active account for MSAL. Request will be unauthenticated.");
            return config;
        }

        const tokenRequest = {
            // Scope for Azure Resource Manager. Ensure this matches backend expectations.
            scopes: [`${process.env.REACT_APP_AZURE_RESOURCE_MANAGER_AUDIENCE}/.default`],
            account: account,
        };

        try {
            const authResult = await msalInstance.acquireTokenSilent(tokenRequest);
            if (authResult.accessToken) {
                config.headers['Authorization'] = `Bearer ${authResult.accessToken}`;
            }
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError) {
                // Silent token acquisition failed.
                // This typically means the user needs to sign in or consent to new scopes.
                // The UI should handle this by prompting for interactive login.
                // For now, the request will proceed without a token or fail if the API requires auth.
                console.warn("Silent token acquisition failed. Interaction required.", error);
                // Optionally, you could trigger an interactive login here, but it's often better handled by the UI component.
                // Example: await msalInstance.acquireTokenPopup(tokenRequest);
                // Or throw an error to be caught by the calling function to trigger login.
                // throw error;
            } else {
                console.error('MSAL token acquisition error:', error);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// --- MSAL Authentication Helper Functions ---

/**
 * Initiates the login process using a popup window.
 */
export const loginPopup = async () => {
    if (!msalInitialized) {
        console.warn("MSAL not initialized. Attempting to initialize before login.");
        await initializeMsal();
    }
    try {
        const loginRequest = {
            scopes: [`${process.env.REACT_APP_AZURE_RESOURCE_MANAGER_AUDIENCE}/.default`],
        };
        const response = await msalInstance.loginPopup(loginRequest);
        msalInstance.setActiveAccount(response.account);
        return response.account;
    } catch (error) {
        console.error("Login popup failed:", error);
        throw error;
    }
};

/**
 * Initiates the login process using a full-page redirect.
 */
export const loginRedirect = async () => {
    if (!msalInitialized) {
        console.warn("MSAL not initialized. Attempting to initialize before login redirect.");
        await initializeMsal();
    }
    try {
        const loginRequest = {
            scopes: [`${process.env.REACT_APP_AZURE_RESOURCE_MANAGER_AUDIENCE}/.default`],
        };
        await msalInstance.loginRedirect(loginRequest);
        // MSAL will handle the redirect and response.
        // You might need to call msalInstance.handleRedirectPromise() in your app's entry point.
    } catch (error) {
        console.error("Login redirect failed:", error);
        throw error;
    }
};

/**
 * Logs the user out.
 */
export const logout = () => {
    if (!msalInitialized) {
        console.warn("MSAL not initialized. Logout might not function correctly.");
        // Optionally, you could try to initialize here too, but logout is usually less critical if init failed.
    }
    const account = msalInstance.getActiveAccount();
    if (account) {
        msalInstance.logoutRedirect({
            account: account,
            postLogoutRedirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
        }).catch(error => {
            console.error("Logout failed:", error);
        });
    } else {
         msalInstance.logoutRedirect({
            postLogoutRedirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
        }).catch(error => {
            console.error("Logout failed:", error);
        });
    }
};

// --- API Call Functions ---

export const fetchBatchSubscriptionCosts = async (subscriptionIds, params) => {
    // params: { timeframe, from_date, to_date, granularity }
    try {
        const response = await apiClient.post('/cost/subscriptions/batch-costs', {
            subscription_ids: subscriptionIds,
            ...params
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching batch subscription costs:', error.response ? error.response.data : error.message);
        throw new Error(error.response?.data?.detail || error.message || 'Failed to fetch batch subscription costs.');
    }
};

export const fetchSubscriptions = async () => {
    try {
        const response = await apiClient.get('/cost/subscriptions');
        return response.data;
    } catch (error) {
        console.error('Error fetching subscriptions:', error.response ? error.response.data : error.message);
        throw new Error(error.response?.data?.detail || error.message || 'Failed to fetch subscriptions. Network error or server unavailable.');
    }
};

export const fetchSubscriptionCosts = async (subscriptionId, params, activeFilters = []) => {
    // params: { timeframe, from_date, to_date, granularity }
    try {
        // Filter out null/undefined values from params before creating URLSearchParams
        const filteredParams = Object.fromEntries(
            Object.entries(params).filter(([_, value]) => value !== null && value !== undefined)
        );

        // Ensure Date objects are formatted as YYYY-MM-DD strings for the API
        if (filteredParams.from_date && filteredParams.from_date instanceof Date) {
            filteredParams.from_date = filteredParams.from_date.toISOString().split('T')[0];
        }
        if (filteredParams.to_date && filteredParams.to_date instanceof Date) {
            filteredParams.to_date = filteredParams.to_date.toISOString().split('T')[0];
        }

        let queryString = new URLSearchParams(filteredParams).toString();


        const tagFilters = activeFilters.filter(f => f.type === 'tag');
        tagFilters.forEach(tagFilter => {
            // Backend needs to support this format. Example:
            // For '=': &tag_Environment=Production
            // For '!=': &tag_CostCenter_ne=123 (or however your backend expects 'not equal')
            // This example assumes a simple key=value for '=' and key_ne=value for '!='
            const paramName = tagFilter.operator === '!=' ?
                `tag_${encodeURIComponent(tagFilter.key)}_ne` :
                `tag_${encodeURIComponent(tagFilter.key)}`;
            queryString += `&${paramName}=${encodeURIComponent(tagFilter.value)}`;
        });

        const url = `/cost/subscriptions/${subscriptionId}/costs?${queryString}`;
        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching costs for subscription ${subscriptionId}:`, error.response ? error.response.data : error.message);
        throw new Error(error.response?.data?.detail || error.message || `Failed to fetch costs for ${subscriptionId}. Network error or server unavailable.`);
    }
};

export const fetchResourceGroupCosts = async (subscriptionId, resourceGroupName, params) => {
    // params: { timeframe, from_date, to_date, granularity }
    try {
        // Filter out null/undefined values from params before creating URLSearchParams
        const filteredParams = Object.fromEntries(
            Object.entries(params).filter(([_, value]) => value !== null && value !== undefined)
        );

        const queryString = new URLSearchParams(filteredParams).toString();
        const response = await apiClient.get(`/cost/subscriptions/${subscriptionId}/resourcegroups/${encodeURIComponent(resourceGroupName)}/costs?${queryString}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching costs for RG ${resourceGroupName}:`, error.response ? error.response.data : error.message);
        throw new Error(error.response?.data?.detail || error.message || `Failed to fetch costs for RG ${resourceGroupName}. Network error or server unavailable.`);
    }
};

export const generateReport = async (subscriptionId, bodyParams, fileFormat = 'csv') => {
    // bodyParams: { timeframe, from_date, to_date, granularity }
    try {
        const response = await apiClient.post(`/cost/subscriptions/${subscriptionId}/costs/generate-report?file_format=${fileFormat}`, bodyParams);
        return response.data; // { message, file_name, download_url }
    } catch (error) {
        console.error(`Error generating report for subscription ${subscriptionId}:`, error.response ? error.response.data : error.message);
        throw new Error(error.response?.data?.detail || error.message || `Failed to generate report for ${subscriptionId}. Network error or server unavailable.`);
    }
};

export const fetchAvailableTags = async (subscriptionId) => {
    if (!subscriptionId) {
        console.warn("Subscription ID is required to fetch available tags.");
        return []; // Or throw an error
    }
    try {
        const response = await apiClient.get(`/cost/subscriptions/${subscriptionId}/available-tags`);
        return response.data; // Expected: List of { tagName: string, values: string[] }
    } catch (error) {
        console.error(`Error fetching available tags for subscription ${subscriptionId}:`, error.response ? error.response.data : error.message);
        // Don't throw an error that breaks the UI, maybe return empty or a specific error structure
        return []; // Or handle error appropriately in the component
    }
};

// Note: Downloading the file itself is typically handled by setting window.location or an <a> tag's href
// to the download_url received from generateReport, as the backend will serve the file.
// For example:
// const handleDownload = (downloadUrl) => {
//   window.open(downloadUrl, '_blank'); // Opens in new tab or triggers download
// };