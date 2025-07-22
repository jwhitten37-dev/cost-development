// src/pages/SubscriptionComparisonPage.js
import React, { useState, useEffect, useMemo } from 'react';
import FilterBar from '../components/FilterBar/FilterBar';
import { Select, MenuItem, FormControl, InputLabel, Paper, Typography, Box, CircularProgress } from '@mui/material';
import './SubscriptionComparisonPage.css';

// Helper to format currency
const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper to calculate and format percentage difference
const calculatePercentageDifference = (base, current) => {
    if (base === null || current === null || base === 0) {
        return { value: 'N/A', className: '' };
    }
    const difference = ((current - base) / base) * 100;
    const className = difference > 0 ? 'increase' : 'decrease';
    const sign = difference > 0 ? '+' : '';
    return {
        value: `${sign}${difference.toFixed(1)}%`,
        className: className
    };
};

// A reusable component for displaying a single metric
const MetricCard = ({ label, value }) => (
    <Paper variant="outlined" className="metric-card">
        <Typography className="metric-label" gutterBottom>{label}</Typography>
        <Typography className="metric-value">{value}</Typography>
    </Paper>
);

// A component to show the difference between two metrics
const DifferenceBlock = ({ label, baseValue, currentValue }) => {
    const diff = calculatePercentageDifference(baseValue, currentValue);
    return (
        <div className="difference-block">
            <Typography className="difference-label">{label}</Typography>
            <Typography className={`difference-value ${diff.className}`}>{diff.value}</Typography>
        </div>
    );
};

const SubscriptionComparisonPage = ({ subscriptions, fetchSubscriptionCosts, account }) => {
    // State for the three selected subscription IDs
    const [selectedSubs, setSelectedSubs] = useState([null, null, null]);
    // State to hold the fetched data for each subscription
    const [comparisonData, setComparisonData] = useState({});
    // State for the page's filters (timeframe, etc.)
    const [activeFilters, setActiveFilters] = useState([
        { id: 'default-timeframe', type: 'timeframe', value: 'MonthToDate', fromDate: null, toDate: null },
        { id: 'default-granularity', type: 'granularity', value: 'None' },
    ]);

    // Memoize timeframe parameters from filters
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

    // Cache Key and Expiration Settings
    const CACHE_KEY_PREFIX = 'subscriptionDataCache';
    const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour expiration time

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

    // Memoized normalized filters to avoid recalculating unnecessarily
    const normalizedFilters = useMemo(() => normalizeFilters(activeFilters), [activeFilters]);
    const filterKey = useMemo(() => JSON.stringify(normalizedFilters), [normalizedFilters]);

    // Effect to fetch data when selections or filters change
    useEffect(() => {
        const fetchDataForSub = async (subId) => {
            if (!subId) return;

            const cacheKey = `${CACHE_KEY_PREFIX}_${subId}_${filterKey}`;
            console.log(`Processing subscription ${subId} with cache key ${cacheKey}`);

            // Helper function to check if cached data is valid
            const isCacheValid = (key) => {
                const cachedData = localStorage.getItem(key);
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

            // Helper function to get cached data
            const getCachedData = (key) => {
                const cachedData = localStorage.getItem(key);
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

            // Helper function to set cached data
            const setCachedData = (key, data) => {
                const cacheEntry = {
                    timestamp: Date.now(),
                    data: data
                };
                try {
                    localStorage.setItem(key, JSON.stringify(cacheEntry));
                    console.log(`Cached data for subscription ${subId} with filter ${filterKey}`);
                    // Optionally clean up old cache entries for this subscription
                    cleanUpOldCacheEntries(subId, key);
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

            // Check if valid cached data exists
            if (isCacheValid(cacheKey)) {
                console.log(`Using cached data for subscription ${subId}`);
                const cachedData = getCachedData(cacheKey);
                setComparisonData(prev => ({ ...prev, [cacheKey]: { data: cachedData, isLoading: false } }));
                return;
            }

            // Fallback to any valid cache for this subscription
            const fallbackCache = findAnyValidCacheForSub(subId);
            if (fallbackCache) {
                console.log(`Using fallback cache for subscription ${subId} from key ${fallbackCache.key}`);
                setComparisonData(prev => ({ ...prev, [cacheKey]: { data: fallbackCache.data, isLoading: false } }));
                return;
            }

            // Set loading state
            console.log(`No cache found for subscription ${subId}, fetching from API`);
            setComparisonData(prev => ({ ...prev, [cacheKey]: { isLoading: true } }));

            try {
                const data = await fetchSubscriptionCosts(subId, timeframeParams, activeFilters);
                setComparisonData(prev => ({ ...prev, [cacheKey]: { data, isLoading: false } }));
                // Cache the fetched data
                setCachedData(cacheKey, data);
            } catch (error) {
                console.error(`Failed to fetch data for ${subId}:`, error);
                setComparisonData(prev => ({ ...prev, [cacheKey]: { error: error.message, isLoading: false } }));
            }
        };

        selectedSubs.forEach(subId => {
            if (subId) {
                fetchDataForSub(subId);
            }
        });
        // eslint-disable-next-line
    }, [selectedSubs, activeFilters, fetchSubscriptionCosts, timeframeParams, filterKey]);

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
        setActiveFilters(prevFilters => prevFilters.filter(f => f.id !== filterId));
    };

    const handleSubSelectionChange = (index, subId) => {
        const newSelectedSubs = [...selectedSubs];
        newSelectedSubs[index] = subId;
        setSelectedSubs(newSelectedSubs);
    };

    // Filter available subscriptions for dropdowns to prevent re-selecting the same one
    const availableSubscriptions = useMemo(() => {
        return subscriptions.filter(sub => !selectedSubs.includes(sub.subscription_id));
    }, [subscriptions, selectedSubs]);

    if (!account) {
        return <Typography>Please log in to use the comparison feature.</Typography>;
    }

    return (
        <div className="comparison-page-container">
            <Typography variant="h4" gutterBottom align="center">Subscription Comparison</Typography>
            <Paper elevation={2} className="comparison-controls">
                <FilterBar
                    activeFilters={activeFilters}
                    onAddFilter={handleAddFilter}
                    onRemoveFilter={handleRemoveFilter}
                    currentSubscriptionId={null}
                />
            </Paper>

            <div className="comparison-area">
                {[0, 1, 2].map((index) => {
                    const selectedId = selectedSubs[index];
                    const subInfo = subscriptions.find(s => s.subscription_id === selectedId);
                    const cacheKey = selectedId ? `${CACHE_KEY_PREFIX}_${selectedId}_${filterKey}` : null;
                    const result = cacheKey ? comparisonData[cacheKey] : null;
                    const data = result?.data;
                    const isLoading = result?.isLoading;
                    const error = result?.error;

                    const resourceCount = data?.costs_by_resource_group ? Object.keys(data.costs_by_resource_group).length : 0;

                    // Data for the previous column to calculate difference
                    const prevSelectedId = index > 0 ? selectedSubs[index - 1] : null;
                    const prevCacheKey = prevSelectedId ? `${CACHE_KEY_PREFIX}_${prevSelectedId}_${filterKey}` : null;
                    const prevResult = prevCacheKey ? comparisonData[prevCacheKey] : null;
                    const prevData = prevResult?.data;
                    const prevResourceCount = prevData?.costs_by_resource_group ? Object.keys(prevData.costs_by_resource_group).length : 0;

                    return (
                        <React.Fragment key={index}>
                            {/* Render separator between columns */}
                            {index > 0 && (
                                <div className="comparison-separator">
                                    {prevData && data && (
                                        <>
                                            <DifferenceBlock label="Actual Cost" baseValue={prevData.total_cost} currentValue={data.total_cost} />
                                            <DifferenceBlock label="Forecasted Cost" baseValue={prevData.projected_cost_current_month} currentValue={data.projected_cost_current_month} />
                                            <DifferenceBlock label="Resource Groups" baseValue={prevResourceCount} currentValue={resourceCount} />
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Render subscription column */}
                            <div className="comparison-column">
                                <FormControl fullWidth>
                                    <InputLabel id={`sub-select-label-${index}`}>Subscription {index + 1}</InputLabel>
                                    <Select
                                        labelId={`sub-select-label-${index}`}
                                        value={selectedId || ''}
                                        label={`Subscription ${index + 1}`}
                                        onChange={(e) => handleSubSelectionChange(index, e.target.value)}
                                    >
                                        <MenuItem value=""><em>-- Select a Subscription --</em></MenuItem>
                                        {/* If a sub is already selected in this column, keep it in the list */}
                                        {subInfo && <MenuItem key={subInfo.subscription_id} value={subInfo.subscription_id}>{subInfo.display_name}</MenuItem>}
                                        {availableSubscriptions.map(sub => (
                                            <MenuItem key={sub.subscription_id} value={sub.subscription_id}>{sub.display_name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
                                {error && <Typography color="error">Error: {error}</Typography>}
                                
                                {data && !isLoading && (
                                    <>
                                        <div className="sub-header">
                                            <Typography variant="h6" noWrap title={subInfo.display_name}>{subInfo.display_name}</Typography>
                                            <Typography variant="caption" color="textSecondary">{subInfo.subscription_id}</Typography>
                                        </div>
                                        <MetricCard label="Actual Cost" value={formatCurrency(data.total_cost)} />
                                        <MetricCard label="Forecasted Cost (EOM)" value={formatCurrency(data.projected_cost_current_month)} />
                                        <MetricCard label="Resource Group Count" value={resourceCount} />
                                    </>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default SubscriptionComparisonPage;