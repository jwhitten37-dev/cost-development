import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './App.css';
import SubscriptionSelector from './components/SubscriptionSelector';
import CostDisplay from './components/CostDisplay';
import ProviderBreakdownView from './components/ProviderBreakdownView';
import SubscriptionOverviewPage from './pages/SubscriptionOverviewPage';
import {
    fetchSubscriptionCosts,
    fetchBatchSubscriptionCosts, // Added for batch API call
    generateReport,
    msalInstance,
    initializeMsal,
    loginPopup,
    logout,
    fetchSubscriptions
} from './services/api';
import FilterBar from './components/FilterBar/FilterBar';
import { parseAzureResourceId } from './utils/resourceIdParser';
import SubscriptionComparisonPage from './pages/SubscriptionComparisonPage';
import DashboardPage from './components/dashboard/DashboardPage';

function App() {
    // View Management
    const [currentView, setCurrentView] = useState('initializing'); // 'initializing', 'login_redirect_in_progress', 'overview', 'detail'
    
    const [account, setAccount] = useState(null); // State for authenticated account
    const [selectedSubscriptionGroup, setSelectedSubscriptionGroup] = useState('AI2C'); // Default to AI2C
    const [msalInitialized, setMsalInitialized] = useState(false);
    const [loginInProgress, setLoginInProgress] = useState(false); // To manage auto-login flow

    const [fetchingSubscriptions, setFetchingSubscriptions] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState('');
    const [discoveredSubscriptions, setDiscoveredSubscriptions] = useState([]);
    const [overviewDataCache, setOverviewDataCache] = useState({}); // { subId: { data, isLoading, error } }
    const [unfilteredOverviewDataCache, setUnfilteredOverviewDataCache] = useState({}); // For the aggregate section
    const [activeFilters, setActiveFilters] = useState([
        { id: 'default-timeframe', type: 'timeframe', key: null, operator: '=', value: 'MonthToDate', fromDate: null, toDate: null },
        { id: 'default-granularity', type: 'granularity', key: null, operator: '=', value: 'None' },
    ]);
    const [subscriptionCostData, setSubscriptionCostData] = useState(null);
    const [selectedResourceGroupForProviders, setSelectedResourceGroupForProviders] = useState(null); // Tracks which RG's providers are shown
    const [providerBreakdownData, setProviderBreakdownData] = useState(null); // Data for the provider breakdown

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Use a ref to track if data fetching has been initiated to prevent multiple calls
    const isFetchingData = useRef(false);

    // Sidebar State
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 992);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // Extract timeframe and granularity from activeFilters for easier use in existing logic
    const timeframeParams = useMemo(() => {
        const tfFilter = activeFilters.find(f => f.type === 'timeframe') || {};
        const granFilter = activeFilters.find(f => f.type === 'granularity') || {};
        return {
            timeframe: tfFilter.value || "MonthToDate",
            from_date: tfFilter.fromDate ? new Date(tfFilter.fromDate).toISOString().split('T')[0] : null,
            to_date: tfFilter.toDate ? new Date(tfFilter.toDate).toISOString().split('T')[0] : null,
            granularity: granFilter.value || "None"
        };
    }, [activeFilters]);

    const handleAddFilter = (newFilter) => {
        setActiveFilters(prevFilters => {
            let updatedFilters = [...prevFilters];
            if (newFilter.type === 'timeframe' || newFilter.type === 'granularity') {
                updatedFilters = updatedFilters.filter(f => f.type !== newFilter.type);
            }
            return [...updatedFilters, { ...newFilter, id: Date.now().toString() }];
        });
    };

    const handleRemoveFilter = (filterId) => {
        setActiveFilters(prevFilters => {
            const newFilters = prevFilters.filter(f => f.id !== filterId);
            if (!newFilters.some(f => f.type === 'timeframe')) newFilters.push({ id: 'default-timeframe', type: 'timeframe', key: null, operator: '=', value: 'MonthToDate', fromDate: null, toDate: null });
            if (!newFilters.some(f => f.type === 'granularity')) newFilters.push({ id: 'default-granularity', type: 'granularity', key: null, operator: '=', value: 'None' });
            return newFilters;
        });
    };

    const handleLogin = async () => {
        setError('');
        try {
            const loggedInAccount = await loginPopup(); // Uses loginPopup from api.js
            setAccount(loggedInAccount);
            setLoginInProgress(false);
            setCurrentView('overview'); // Ensure view is set to overview after login
        } catch (error) {
            console.error("Login failed:", error);
            setError("Login failed. Please try again.");
            setLoginInProgress(false);
            setCurrentView('login_required');
        }
    };

    const loginRedirect = useCallback(async () => {
        if (!msalInitialized) await initializeMsal(); 
        await msalInstance.loginRedirect({ 
            scopes: [`${process.env.REACT_APP_AZURE_RESOURCE_MANAGER_AUDIENCE}/.default`],
        });
    }, [msalInitialized]); // loginRedirect will only be recreated if msalInitialized changes

    const handleLogout = () => {
        logout();
        setAccount(null);
        setSelectedSubscription('');
        clearDataAndSelections();
        setDiscoveredSubscriptions([]);
        setCurrentView('login_required');
    };

    const handleSubscriptionsFetched = useCallback((allSubscriptions) => {
        // Store all discovered subscriptions. Filtering will be handled by the group selector.
        if (allSubscriptions && Array.isArray(allSubscriptions)) {
            setDiscoveredSubscriptions(allSubscriptions);
        } else {
            setDiscoveredSubscriptions([]);
        }
    }, []);

    // MSAL: Handle redirect promise and check for active account on initial load
    useEffect(() => {
        const initializeAndHandleRedirect = async () => {
            try {
                if (!msalInitialized) {
                    await initializeMsal();
                    setMsalInitialized(true);
                }

                // Set view to prevent UI flicker during redirect processing
                if (window.sessionStorage.getItem("msal.interaction.status") === "interaction_in_progress") {
                    setCurrentView('login_redirect_in_progress');
                }

                const tokenResponse = await msalInstance.handleRedirectPromise();
                if (tokenResponse && tokenResponse.account) {
                    msalInstance.setActiveAccount(tokenResponse.account);
                    setAccount(tokenResponse.account);
                    // Only transition to overview if we were in an initial or redirect state
                    if (currentView === 'initializing' || currentView === 'login_redirect_in_progress') {
                        setCurrentView('overview');
                    }
                } else {
                    const currentAccount = msalInstance.getActiveAccount();
                    if (currentAccount) {
                        setAccount(currentAccount);
                        // Only transition to overview if we were in an initial state
                        if (currentView === 'initializing') {
                            setCurrentView('overview');
                        }
                    } else if (msalInitialized && !loginInProgress && currentView !== 'login_redirect_in_progress') {
                        // If no account and MSAL is ready, and not already trying to log in, initiate login
                        setLoginInProgress(true);
                        setCurrentView('login_redirect_in_progress'); // Update view state
                        await loginRedirect().catch(err => {
                            console.error("Auto login redirect failed:", err);
                            setError("Automatic login failed. Please try the login button.");
                            setCurrentView('login_required'); // A view to show login button
                            setLoginInProgress(false);
                        });
                        // Redirect will occur, so no further state changes here needed for success case
                    }
                }
            } catch (error) {
                console.error("MSAL setup or redirect handling error:", error);
                setError("Login initialization failed. Please refresh. If the issue persists, clear your session storage.");
                setCurrentView('error_page'); // A view to show critical error
                setLoginInProgress(false);
            }
        };

        initializeAndHandleRedirect();
    }, [msalInitialized, loginInProgress, currentView, loginRedirect]); // Add msalInitialized, loginInProgress, currentView

    useEffect(() => {
        const checkMobileView = () => {
            const mobile = window.innerWidth < 992;
            setIsMobileView(mobile);
            if (!mobile) setIsMobileSidebarOpen(false);
        };
        window.addEventListener('resize', checkMobileView);
        checkMobileView();
        return () => window.removeEventListener('resize', checkMobileView);
    }, []);

    const toggleMobileSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);

    const clearProviderBreakdown = useCallback(() => {
        setSelectedResourceGroupForProviders(null);
        setProviderBreakdownData(null);
    }, []);

    const clearDataAndSelections = useCallback(() => {
        setSubscriptionCostData(null);
        clearProviderBreakdown(); // Also clear provider breakdown when main data clears
        setError('');
    }, [clearProviderBreakdown]);

    const fetchData = useCallback(async (subId, params) => {
        if (!subId) {
            clearDataAndSelections();
            return;
        }
        setIsLoading(true);
        clearProviderBreakdown(); // Clear provider view when fetching new subscription/timeframe data

        try {
            const subDataFromApi = await fetchSubscriptionCosts(subId, params, activeFilters); // Pass activeFilters
            const foundSub = discoveredSubscriptions.find(s => s.subscription_id === subId);
            const actualDisplayName = foundSub ? foundSub.display_name : subId;
            setSubscriptionCostData({ ...subDataFromApi, subscription_name: actualDisplayName });
            setError('');
        } catch (err) {
            setError(err.detail || err.message || "Failed to fetch cost data.");
            setSubscriptionCostData(null);
        } finally {
            setIsLoading(false);
        }
    }, [clearProviderBreakdown, clearDataAndSelections, discoveredSubscriptions, activeFilters]);

    // Helper to check if activeFilters represent the default state (MonthToDate, None, no tags)
    const areFiltersDefault = useCallback((filters) => {
        if (filters.length !== 2) return false;
        const hasDefaultTimeframe = filters.some(f => f.type === 'timeframe' && f.value === 'MonthToDate' && !f.fromDate && !f.toDate);
        const hasDefaultGranularity = filters.some(f => f.type === 'granularity' && f.value === 'None');
        const hasTagFilters = filters.some(f => f.type === 'tag');
        return hasDefaultTimeframe && hasDefaultGranularity && !hasTagFilters;
    }, []);

    // Fetch cost data for all discovered subscriptions for the overview page using batch API
    useEffect(() => {
        if (currentView === 'overview' && discoveredSubscriptions.length > 0 && !isFetchingData.current) {
            isFetchingData.current = true; // Mark as fetching started
            const fetchAllOverviewData = async () => {
                // Helper function to introduce a delay if needed for rate limiting
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                // Helper function for retrying API calls with exponential backoff
                const fetchWithRetry = async (batch, params, retries = 3, baseDelay = 5000) => {
                    for (let attempt = 0; attempt < retries; attempt++) {
                        try {
                            const batchData = await fetchBatchSubscriptionCosts(batch, params);
                            return batchData;
                        } catch (err) {
                            let retryAfter = 5000; // Default retry delay
                            if (err.message.includes("429") || err.message.includes("Too Many Requests")) {
                                // Extract Retry-After from error message if available
                                const retryAfterMatch = err.message.match(/Retry-After: (\d+)/);
                                retryAfter = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : baseDelay * Math.pow(2, attempt);
                                retryAfter += Math.random() * 100; // Add jitter
                                console.log(`Rate limit error for batch ${batch}. Retrying after ${retryAfter}ms (attempt ${attempt + 1}/${retries})`);
                            } else if (err.message.includes("Network Error") || err.message.includes("ERR_INSUFFICIENT_RESOURCES")) {
                                retryAfter = baseDelay * Math.pow(2, attempt) + Math.random() * 500; // Longer delay for network errors
                                console.log(`Network error for batch ${batch}. Retrying after ${retryAfter}ms (attempt ${attempt + 1}/${retries})`);
                            } else {
                                throw err; // Non-rate-limit or non-network error, throw immediately
                            }
                            await delay(retryAfter);
                            if (attempt === retries - 1) {
                                throw err; // Last retry failed, throw the error
                            }
                        }
                    }
                };

                // Get subscription IDs for the batch request
                const subscriptionIds = discoveredSubscriptions.map(sub => sub.subscription_id);
                const batchSize = 1; // Reduced to 1 to minimize rate limiting issues
                const batches = [];
                for (let i = 0; i < subscriptionIds.length; i += batchSize) {
                    batches.push(subscriptionIds.slice(i, i + batchSize));
                }

                // --- Cache Key Prefix and Expiration Settings ---
                const CACHE_KEY_PREFIX = 'subscriptionDataCache';
                const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour expiration time (adjust as needed)

                // Helper function to normalize filters for consistent cache key generation
                const normalizeFilters = (filters) => {
                    return filters.map(filter => ({
                        id: filter.id,
                        type: filter.type,
                        key: filter.key || null,
                        operator: filter.operator || '=',
                        value: filter.value || '',
                        fromDate: filter.fromDate || null,
                        toDate: filter.toDate || null
                    })).sort((a, b) => a.id.localeCompare(b.id)); // Sort by id for consistent ordering
                };

                // Helper function to check if cached data is valid for a specific subscription
                const isCacheValid = (subId, filterKey) => {
                    const cacheKey = `${CACHE_KEY_PREFIX}_${subId}_${filterKey}`;
                    const cachedData = localStorage.getItem(cacheKey);
                    if (!cachedData) return false;
                    try {
                        const { timestamp, data } = JSON.parse(cachedData);
                        const now = Date.now();
                        return (now - timestamp) < CACHE_EXPIRY_MS && data && Object.keys(data).length > 0;
                    } catch (e) {
                        console.error(`Error parsing cached data for subscription ${subId}:`, e);
                        return false;
                    }
                };

                // Helper function to get cached data for a specific subscription
                const getCachedData = (subId, filterKey) => {
                    const cacheKey = `${CACHE_KEY_PREFIX}_${subId}_${filterKey}`;
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        try {
                            const { data } = JSON.parse(cachedData);
                            return data;
                        } catch (e) {
                            console.error(`Error retrieving cached data for subscription ${subId}:`, e);
                            return null;
                        }
                    }
                    return null;
                };

                // Helper function to find any valid cache entry for a subscription using pattern matching
                const findAnyValidCacheForSub = (subId) => {
                    const prefix = `${CACHE_KEY_PREFIX}_${subId}_`;
                    let latestEntry = null;
                    let latestTimestamp = 0;
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key.startsWith(prefix)) {
                            try {
                                const cachedData = localStorage.getItem(key);
                                const { timestamp, data } = JSON.parse(cachedData);
                                const now = Date.now();
                                if ((now - timestamp) < CACHE_EXPIRY_MS && data && Object.keys(data).length > 0 && timestamp > latestTimestamp) {
                                    latestTimestamp = timestamp;
                                    latestEntry = { key, data };
                                }
                            } catch (e) {
                                console.error(`Error parsing cached data for key ${key}:`, e);
                            }
                        }
                    }
                    return latestEntry;
                };

                // Helper function to set cached data for a specific subscription
                const setCachedData = (subId, filterKey, data) => {
                    const cacheKey = `${CACHE_KEY_PREFIX}_${subId}_${filterKey}`;
                    const cacheEntry = {
                        timestamp: Date.now(),
                        data: data
                    };
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
                        console.log(`Cached data for subscription ${subId} with filter ${filterKey}`);
                        // Optionally clean up old cache entries for this subscription
                        cleanUpOldCacheEntries(subId, cacheKey);
                    } catch (e) {
                        console.error(`Error saving to localStorage for subscription ${subId}:`, e);
                    }
                };

                // Helper function to clean up old cache entries for a subscription
                const cleanUpOldCacheEntries = (subId, currentKey) => {
                    const prefix = `${CACHE_KEY_PREFIX}_${subId}_`;
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key.startsWith(prefix) && key !== currentKey) {
                            try {
                                localStorage.removeItem(key);
                                console.log(`Removed old cache entry for subscription ${subId}: ${key}`);
                            } catch (e) {
                                console.error(`Error removing old cache entry ${key}:`, e);
                            }
                        }
                    }
                };

                // --- Fetch Filtered Data for Individual Blocks using Batch API ---
                const normalizedFilters = normalizeFilters(activeFilters);
                const filteredCacheKey = JSON.stringify(normalizedFilters);
                const shouldFetchFiltered = !subscriptionIds.every(subId => isCacheValid(subId, filteredCacheKey)) || 
                                            Object.values(overviewDataCache).some(entry => entry.error && !entry.isLoading);

                if (shouldFetchFiltered) {
                    // Initialize state for subscriptions that need fetching
                    setOverviewDataCache(prev => {
                        const newCache = { ...prev };
                        subscriptionIds.forEach(subId => {
                            if (!isCacheValid(subId, filteredCacheKey)) {
                                newCache[subId] = { isLoading: true, error: null, data: null, triggeredBy: filteredCacheKey };
                            }
                        });
                        return newCache;
                    });

                    try {
                        const overviewTimeframeParams = { ...timeframeParams, granularity: "None" };
                        // Process batches sequentially with delay to avoid rate limits
                        const batchResults = [];
                        for (const batch of batches) {
                            const batchData = await fetchWithRetry(batch, overviewTimeframeParams);
                            batchResults.push(...batchData);
                            await delay(5000); // Increased delay between batches to avoid rate limits
                        }
                        // Update state only once after all batches are processed
                        setOverviewDataCache(prev => {
                            const newCache = { ...prev };
                            batchResults.forEach(subData => {
                                newCache[subData.subscription_id] = { 
                                    isLoading: false, 
                                    error: subData.error || null, 
                                    data: subData.error ? null : subData, 
                                    triggeredBy: filteredCacheKey 
                                };
                                // Cache data individually for each subscription
                                if (!subData.error) {
                                    setCachedData(subData.subscription_id, filteredCacheKey, subData);
                                }
                            });
                            return newCache;
                        });
                    } catch (err) {
                        console.error(`Failed to fetch batch overview data:`, err);
                        setOverviewDataCache(prev => {
                            const newCache = { ...prev };
                            subscriptionIds.forEach(subId => {
                                if (!isCacheValid(subId, filteredCacheKey)) {
                                    newCache[subId] = { 
                                        isLoading: false, 
                                        error: err.message || "Failed to load data", 
                                        data: null, 
                                        triggeredBy: filteredCacheKey 
                                    };
                                }
                            });
                            return newCache;
                        });
                    }
                } else {
                    console.log("Using cached data for all subscriptions in overview");
                    setOverviewDataCache(prev => {
                        const newCache = { ...prev };
                        subscriptionIds.forEach(subId => {
                            let cachedData = getCachedData(subId, filteredCacheKey);
                            if (!cachedData) {
                                const fallbackCache = findAnyValidCacheForSub(subId);
                                if (fallbackCache) {
                                    cachedData = fallbackCache.data;
                                    console.log(`Using fallback cache for subscription ${subId} from key ${fallbackCache.key}`);
                                }
                            }
                            if (cachedData) {
                                newCache[subId] = { 
                                    isLoading: false, 
                                    error: null, 
                                    data: cachedData, 
                                    triggeredBy: filteredCacheKey 
                                };
                            }
                        });
                        return newCache;
                    });
                }

                // --- Handle Unfiltered Data for Aggregate Section ---
                const isCurrentFilterDefault = areFiltersDefault(activeFilters);
                const defaultUnfilteredTrigger = "defaultMonthToDate";
                const shouldFetchUnfiltered = !subscriptionIds.every(subId => isCacheValid(subId, defaultUnfilteredTrigger)) || 
                                              Object.values(unfilteredOverviewDataCache).some(entry => entry.error && !entry.isLoading);

                if (isCurrentFilterDefault) {
                    // If filters are default, copy filtered data to unfiltered cache if available
                    if (shouldFetchFiltered) {
                        setUnfilteredOverviewDataCache(prev => {
                            const newCache = { ...prev };
                            subscriptionIds.forEach(subId => {
                                const filteredEntry = overviewDataCache[subId];
                                if (filteredEntry) {
                                    newCache[subId] = { 
                                        isLoading: filteredEntry.isLoading, 
                                        error: filteredEntry.error, 
                                        data: filteredEntry.data, 
                                        triggeredBy: defaultUnfilteredTrigger 
                                    };
                                }
                            });
                            return newCache;
                        });
                    }
                } else if (shouldFetchUnfiltered) {
                    if (subscriptionIds.every(subId => isCacheValid(subId, defaultUnfilteredTrigger))) {
                        console.log("Using cached unfiltered data for all subscriptions");
                        setUnfilteredOverviewDataCache(prev => {
                            const newUnfilteredCache = { ...prev };
                            subscriptionIds.forEach(subId => {
                                let cachedData = getCachedData(subId, defaultUnfilteredTrigger);
                                if (!cachedData) {
                                    const fallbackCache = findAnyValidCacheForSub(subId);
                                    if (fallbackCache) {
                                        cachedData = fallbackCache.data;
                                        console.log(`Using fallback cache for subscription ${subId} from key ${fallbackCache.key} for unfiltered data`);
                                    }
                                }
                                newUnfilteredCache[subId] = { 
                                    isLoading: false, 
                                    error: null, 
                                    data: cachedData, 
                                    triggeredBy: defaultUnfilteredTrigger 
                                };
                            });
                            return newUnfilteredCache;
                        });
                    } else {
                        setUnfilteredOverviewDataCache(prev => {
                            const newCache = { ...prev };
                            subscriptionIds.forEach(subId => {
                                if (!isCacheValid(subId, defaultUnfilteredTrigger)) {
                                    newCache[subId] = { isLoading: true, error: null, data: null, triggeredBy: defaultUnfilteredTrigger };
                                }
                            });
                            return newCache;
                        });

                        try {
                            const unfilteredTimeframeParams = { timeframe: "MonthToDate", granularity: "None" };
                            // Process batches sequentially with delay for unfiltered data
                            const unfilteredBatchResults = [];
                            for (const batch of batches) {
                                const batchData = await fetchWithRetry(batch, unfilteredTimeframeParams);
                                unfilteredBatchResults.push(...batchData);
                                await delay(5000); // Increased delay between batches to avoid rate limits
                            }
                            setUnfilteredOverviewDataCache(prev => {
                                const newUnfilteredCache = { ...prev };
                                unfilteredBatchResults.forEach(subData => {
                                    newUnfilteredCache[subData.subscription_id] = { 
                                        isLoading: false, 
                                        error: subData.error || null, 
                                        data: subData.error ? null : subData, 
                                        triggeredBy: defaultUnfilteredTrigger 
                                    };
                                    // Cache data individually for each subscription
                                    if (!subData.error) {
                                        setCachedData(subData.subscription_id, defaultUnfilteredTrigger, subData);
                                    }
                                });
                                return newUnfilteredCache;
                            });
                        } catch (err) {
                            console.error(`Failed to fetch unfiltered batch overview data:`, err);
                            setUnfilteredOverviewDataCache(prev => {
                                const newCache = { ...prev };
                                subscriptionIds.forEach(subId => {
                                    if (!isCacheValid(subId, defaultUnfilteredTrigger)) {
                                        newCache[subId] = { 
                                            isLoading: false, 
                                            error: err.message || "Failed to load data", 
                                            data: null, 
                                            triggeredBy: defaultUnfilteredTrigger 
                                        };
                                    }
                                });
                                return newCache;
                            });
                        }
                    }
                }

                // Optional delay if multiple batch calls are needed in the future
                await delay(500); // Adjust delay as needed if rate limits are still an issue
                isFetchingData.current = false; // Reset fetching flag
            };
            fetchAllOverviewData();
        }
        // eslint-disable-next-line
    }, [currentView, discoveredSubscriptions, activeFilters, timeframeParams, areFiltersDefault]);

    // Fetch initial list of subscriptions when user is authenticated and list is empty
    useEffect(() => {
        if (account && discoveredSubscriptions.length === 0 && !fetchingSubscriptions && (currentView === 'overview' || currentView === 'detail')) {
            setFetchingSubscriptions(true);
            setError(''); // Clear previous errors related to subscription fetching
            fetchSubscriptions()
                .then(allRawSubscriptions => {
                    // The handleSubscriptionsFetched callback will filter and setDiscoveredSubscriptions
                    handleSubscriptionsFetched(allRawSubscriptions);
                })
                .catch(err => {
                    console.error("Failed to load subscriptions list in App.js:", err);
                    setError(err.detail || err.message || "Failed to load subscriptions list.");
                    setDiscoveredSubscriptions([]); // Ensure it's empty on error
                })
                .finally(() => {
                    setFetchingSubscriptions(false);
                });
        }
    }, [account, discoveredSubscriptions.length, fetchingSubscriptions, handleSubscriptionsFetched, currentView]);

    const handleSubscriptionSelect = (subscriptionId) => {
        // This function is now primarily for the SubscriptionSelector in the detail view's sidebar
        setSelectedSubscription(subscriptionId);
        if (subscriptionId) {
            fetchData(subscriptionId, timeframeParams);
        } else {
            clearDataAndSelections(); // Clear data if "-- Select --" is chosen
        }
    };

    const aggregateCostsByProvider = useCallback((detailedEntriesForRG) => {
        if (!detailedEntriesForRG || detailedEntriesForRG.length === 0) return null;
        const aggregation = {};

        detailedEntriesForRG.forEach(entry => {
            if (!entry.resourceId) return;
            const parsedId = parseAzureResourceId(entry.resourceId);
            if (!parsedId || !parsedId.provider) return;

            const providerKey = parsedId.provider.toLowerCase();
            const providerDisplayName = parsedId.provider;

            if (!aggregation[providerKey]) {
                aggregation[providerKey] = {
                    displayName: providerDisplayName,
                    totalCost: 0,
                    count: 0,
                    currency: entry.currency,
                    entries: []
                };
            }
            aggregation[providerKey].totalCost += entry.amount;
            aggregation[providerKey].entries.push(entry);
            aggregation[providerKey].count = aggregation[providerKey].entries.length;
            aggregation[providerKey].currency = entry.currency;
        });
        return aggregation;
    }, []);

    const handleResourceGroupSelectForProviders = useCallback((rgName) => {
        if (selectedResourceGroupForProviders === rgName) { // Clicked again on the same RG
            clearProviderBreakdown();
            return;
        }

        if (!subscriptionCostData || !subscriptionCostData.detailed_entries) {
            setError("Subscription detailed data not available for provider breakdown.");
            return;
        }

        setSelectedResourceGroupForProviders(rgName);
        const rgNameLower = rgName?.toLowerCase();

        const rgEntries = subscriptionCostData.detailed_entries.filter(entry => {
            if (!entry.resourceId) return false;
            const parsed = parseAzureResourceId(entry.resourceId);
            return parsed && parsed.resourceGroupName && parsed.resourceGroupName.toLowerCase() === rgNameLower;
        });

        const providers = aggregateCostsByProvider(rgEntries);
        setProviderBreakdownData(providers);

    }, [subscriptionCostData, aggregateCostsByProvider, selectedResourceGroupForProviders, clearProviderBreakdown]);

    const handleGenerateReport = useCallback(async (fileFormat = 'csv') => {
        if (!selectedSubscription) {
            setError("Please select a subscription first."); return;
        }
        setIsLoading(true); setError('');
        try {
            const reportParams = { ...timeframeParams };
            const response = await generateReport(selectedSubscription, reportParams, fileFormat);
            if (response.download_url) window.open(response.download_url, '_blank');
        } catch (err) {
            setError(err.detail || err.message || `Failed to generate report.`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedSubscription, timeframeParams]);
    
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 7000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Derive unique subscription groups from all discovered subscriptions
    const subscriptionGroups = useMemo(() => {
        if (!discoveredSubscriptions) return [];
        const groups = new Set();
        discoveredSubscriptions.forEach(sub => {
            // Format: {PARENT}-{GROUP}-{PROJECT}-{PLATFORM}-{METADATA}
            const parts = sub.display_name.split('-');
            if (parts.length > 1) {
                groups.add(parts[1]);
            }
        });
        // Ensure AI2C is an option if present, and sort alphabetically
        return ['All', ...Array.from(groups).sort()];
    }, [discoveredSubscriptions]);

    // Filter subscriptions based on the selected group
    const filteredSubscriptions = useMemo(() => {
        if (!selectedSubscriptionGroup || selectedSubscriptionGroup === 'All') {
            return discoveredSubscriptions;
        }
        return discoveredSubscriptions.filter(sub => sub.display_name.split('-')[1] === selectedSubscriptionGroup);
    }, [discoveredSubscriptions, selectedSubscriptionGroup]);

    // Navigation Handlers
    const navigateToDetailView = (subscriptionId) => {
        setSelectedSubscription(subscriptionId);
        setCurrentView('detail');
        fetchData(subscriptionId, timeframeParams); // Fetch data for the detailed view
    };

    const navigateToOverview = () => {
        console.log("Navigating to Overview page...");
        setCurrentView('overview');
        setSelectedSubscription(''); // Clear selected subscription for detail view
        setSubscriptionCostData(null); // Clear detailed cost data
        clearProviderBreakdown();
    };

    // --- Conditional Rendering Logic ---

    if (currentView === 'initializing' || currentView === 'login_redirect_in_progress' || (msalInitialized && !account && loginInProgress)) {
        return (
            <div className="app-container loading-container">
                <header className="App-header"><h1>Cloud Overall Spend Tracker (COST)</h1></header>
                <p className="loading-message">Initializing and authenticating...</p>
                {/* Placeholder for a site image can go here */}
            </div>
        );
    }

    if (currentView === 'error_page') {
        return <div className="app-container error-container"><p>Critical Error: {error}</p></div>;
    }

    return (
        <Router>
        <div className={`app-container ${isMobileView && isMobileSidebarOpen ? 'sidebar-open-mobile' : ''}`}>
            {isMobileView && (
                // Only show hamburger if sidebar content is still relevant (e.g., for detail view navigation)
                // If sidebar is completely removed, this can be removed too.
                // For now, let's assume detail view might still use it for subscription selection.
                 (currentView === 'detail') && <button className="hamburger-button" onClick={toggleMobileSidebar} aria-label="Toggle sidebar">☰</button>
            )}
            {/* Conditionally render sidebar: only for detail view or if mobile sidebar is open for navigation */}
            {((currentView === 'detail' && !isMobileView) || (isMobileView && isMobileSidebarOpen && currentView === 'detail')) && (
                 <div className={`sidebar ${isMobileView && !isMobileSidebarOpen ? 'collapsed' : ''}`}>
                    <div className="sidebar-content">
                        {account && currentView === 'detail' && (
                            <>
                                <div className="subscription-input-area">
                                    <button onClick={navigateToOverview} className="nav-button">Back to Overview</button>
                                    <SubscriptionSelector
                                        onSubscriptionSelect={handleSubscriptionSelect}
                                        currentSelectedId={selectedSubscription}
                                        onError={setError}
                                        isLoading={isLoading || fetchingSubscriptions}
                                        items={discoveredSubscriptions}
                                        isAuthenticated={!!account}
                                    />
                                </div>
                                {(selectedSubscription) && (
                                    <div className="report-buttons section-spacing">
                                        <button onClick={() => handleGenerateReport('csv')} disabled={isLoading}>
                                            {isLoading ? 'Processing...' : 'Download CSV'}
                                        </button>
                                        <button onClick={() => handleGenerateReport('excel')} disabled={isLoading}>
                                            {isLoading ? 'Processing...' : 'Download Excel'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="main-content-area">
                <header className="App-header">
                    {/* Site Logo Placeholder can go here if needed */}
                    {/* <img src="/path-to-your-logo.png" alt="Site Logo" className="site-logo-placeholder" /> */}
                    {(account && currentView !== 'overview') ? (
                        <h1 onClick={navigateToOverview} className="clickable-header-title">
                            Cloud Overall Spending Tracker (COST)
                        </h1>
                    ) : account ? (
                        <h1>Cloud Overall Spending Tracker (COST)</h1>
                    ) : null}
                    <div className="header-auth-section">
                        {(!account && currentView !== 'overview' && currentView !== 'detail') || currentView === 'login_required' ? (
                                <button onClick={handleLogin} className="auth-button login-button">Login</button>
                        ) : account ? (
                            <>
                                <span className="user-greeting">Welcome, {account.name || account.username}</span>
                                <button onClick={handleLogout} className="auth-button logout-button">Logout</button>
                                {/* User Avatar Placeholder */}
                                {/* <img src="/path-to-avatar.png" alt="User Avatar" className="user-avatar-placeholder" /> */}
                            </>
                        ) : null}
                    </div>
                </header>
                {account && currentView === 'detail' && (
                    <FilterBar
                        activeFilters={activeFilters}
                        onAddFilter={handleAddFilter}
                        onRemoveFilter={handleRemoveFilter}
                        currentSubscriptionId={selectedSubscription}
                    />
                )}
                <main className="app-main-content">
                    {error && (
                        <p className="error-message">
                            Error: {typeof error === 'string' ? error : (error.message || JSON.stringify(error))}
                        </p>
                    )}
                        
                        {/* Use Routes to handle navigation. The new page gets its own route. */}
                        {/* The existing logic is wrapped in a "catch-all" route to prevent breaking changes. */}
                        <Routes>
                            <Route 
                                path="/compare" 
                                element={
                                    <SubscriptionComparisonPage
                                        subscriptions={discoveredSubscriptions}
                                        fetchSubscriptionCosts={fetchSubscriptionCosts}
                                        account={account}
                                    />
                                } 
                            />
                            <Route 
                                path="/dashboard" 
                                element={
                                    <DashboardPage />
                                } 
                            />
                            <Route path="/*" element={
                                <>
                                    {/* This fragment contains all the original conditional rendering logic */}
                                    {isLoading && currentView === 'detail' && <p className="loading-message">Loading detailed data...</p>}
                                    {!account && !isLoading && currentView !== 'initializing' && currentView !== 'login_redirect_in_progress' && (
                                        <p className="info-message">Please log in to continue.</p>
                                    )}
                                    {account && currentView === 'overview' && (
                                        <SubscriptionOverviewPage
                                            subscriptions={filteredSubscriptions}
                                            overviewData={overviewDataCache}
                                            unfilteredOverviewData={unfilteredOverviewDataCache}
                                            onSubscriptionBlockClick={navigateToDetailView}
                                            activeFilters={activeFilters}
                                            onAddFilter={handleAddFilter}
                                            onRemoveFilter={handleRemoveFilter}
                                            globalTimeframeParams={timeframeParams}
                                            subscriptionGroups={subscriptionGroups}
                                            selectedGroup={selectedSubscriptionGroup}
                                            onGroupChange={setSelectedSubscriptionGroup}
                                        />
                                    )}
                                    {account && currentView === 'detail' && !selectedSubscription && !isLoading && (
                                        <p className="info-message">
                                            {fetchingSubscriptions 
                                                ? "Loading available subscriptions..." 
                                                : "Please select a subscription from the overview to see details, or use the selector in the sidebar if you were already viewing one."}
                                        </p>
                                    )}
                                    {account && currentView === 'detail' && selectedSubscription && subscriptionCostData && !isLoading && (
                                        <CostDisplay
                                            costData={subscriptionCostData}
                                            onResourceGroupSelect={handleResourceGroupSelectForProviders}
                                            selectedResourceGroup={selectedResourceGroupForProviders}
                                        />
                                    )}
                                    {/* Conditionally render ProviderBreakdownView based on selectedResourceGroupForProviders and providerBreakdownData */}
                                    {account && currentView === 'detail' && selectedResourceGroupForProviders && providerBreakdownData && !isLoading && (
                                        <ProviderBreakdownView
                                            resourceGroupName={selectedResourceGroupForProviders}
                                            providersData={providerBreakdownData}
                                            onClear={clearProviderBreakdown}
                                        />
                                    )}
                                    {/* Message if RG is selected but no provider data (e.g., RG has no costs or no resources) */}
                                    {account && currentView === 'detail' && selectedResourceGroupForProviders && !providerBreakdownData && subscriptionCostData && !isLoading &&
                                        <div className="provider-breakdown-section">
                                            <h4>Providers in {selectedResourceGroupForProviders}</h4>
                                            <p>No provider cost data found for this resource group in the current selection.</p>
                                            <button onClick={clearProviderBreakdown} className="clear-provider-view-button">× Hide</button>
                                        </div>
                                    }
                                    {account && currentView === 'detail' && selectedSubscription && !subscriptionCostData && !error && !isLoading &&
                                        <p className="info-message">No cost data available for the selected criteria or still loading for {selectedSubscription}.</p>
                                    }
                                </>
                            } />
                        </Routes>
                </main>
                <footer className="App-footer">
                    <p>v2.0.1</p>
                    <p>Created by Infrastructure and Platforms (I&P) Portfolio, AI2C</p>
                </footer>
            </div>
        </div>
        </Router>
    );
}
export default App;