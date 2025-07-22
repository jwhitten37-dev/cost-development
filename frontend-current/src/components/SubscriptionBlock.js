// Simplified example for /home/jut/cost/frontend/src/components/SubscriptionBlock.js
import React, { useEffect } from 'react';
import { Card, CardContent, Typography, Box, CircularProgress } from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Helper to format Y-axis ticks as currency
const formatYAxis = (tickItem) => `$${tickItem.toLocaleString()}`;

// Helper to format tooltip currency
const formatTooltipCurrency = (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


const SubscriptionBlock = ({ subscription, costData, isLoading, error, onClick }) => {
    // costData is expected to be overviewDataCache[sub.subscription_id].data
    // which should now include yearly_monthly_breakdown

    useEffect(() => {
        // console.log(`SubscriptionBlock (${subscription?.display_name}): Received costData:`, costData);
    }, [costData, subscription?.display_name]);

    // Data transformation for Area Chart
    let initialChartData = [];
    if (costData?.yearly_monthly_breakdown) {
        initialChartData = costData.yearly_monthly_breakdown.map(item => ({
            name: item.month,
            Actual: item.actual !== null ? item.actual : null,
            _eomForecastForTooltip: item.forecast !== null ? item.forecast : null
        }));
    }

    let lastActualPointIndex = -1;
    for (let i = initialChartData.length - 1; i >= 0; i--) {
        if (initialChartData[i].Actual !== null) {
            lastActualPointIndex = i;
            break;
        }
    }

    const finalChartData = initialChartData.map((point, index) => {
        let forecastSeriesValue = null;
 
        if (lastActualPointIndex === -1) {
            // No actuals at all, plot all available EOM forecasts
            forecastSeriesValue = point._eomForecastForTooltip;
        } else if (lastActualPointIndex === 0) { // First point is actual, no previous to connect
            if (index >= lastActualPointIndex) { // Show forecast from this point on
                forecastSeriesValue = point._eomForecastForTooltip;
            }
        } else {
            // lastActualPointIndex > 0, can connect from previous
            if (index === lastActualPointIndex - 1) {
                forecastSeriesValue = point.Actual;
            } else if (index >= lastActualPointIndex) {
                forecastSeriesValue = point._eomForecastForTooltip;
            }
        }
        return { ...point, Forecast: forecastSeriesValue };
    });

    // Custom tooltip formatter
    const customTooltipFormatterSubscriptionBlock = (value, name, props) => {
        const { payload } = props;
        if (name === "Actual") {
            return value !== null ? formatTooltipCurrency(value) : null;
        }
        if (name === "Forecast") {
            const eomValue = payload._eomForecastForTooltip;
            return eomValue !== null ? formatTooltipCurrency(eomValue) : null;
        }
        return value !== null ? formatTooltipCurrency(value) : null;
    };

    // Determine max Y-axis value dynamically, or use a fixed one as per original request (0-400)
    let maxYValue = 400; // Default from original request
    if (finalChartData.length > 0) {
        const allValues = finalChartData.reduce((acc, cur) => {
            if (cur.Actual != null) acc.push(cur.Actual);
            if (cur._eomForecastForTooltip != null) acc.push(cur._eomForecastForTooltip);
            return acc;
        }, []);
        if (allValues.length > 0) {
            maxYValue = Math.max(400, ...allValues) * 1.1; // Add 10% padding, ensure at least 400
        }
    }
    const yAxisDomain = [0, Math.ceil(maxYValue / 100) * 100]; // Round up to nearest 100
    const topResourceGroups = costData?.costs_by_resource_group
        ? Object.entries(costData.costs_by_resource_group) // [ [rgName, cost], ... ]
            .sort(([, a], [, b]) => b - a) // Sort by cost descending
            .slice(0, 5) // Take top 5
            // .map(([name]) => name) // We need both name and cost now
        : [];

    return (
        <Card 
            sx={{ 
                margin: 1, 
                cursor: 'pointer', 
                minWidth: 300, 
                flex: '1 1 400px', // Flex properties for responsiveness
                maxWidth: 'calc(50% - 16px)', // Example for 2 cards per row on wider screens
                '@media (max-width: 900px)': {
                    maxWidth: 'calc(100% - 16px)', // Full width on smaller screens
                }
            }} 
            onClick={() => onClick(subscription.subscription_id)}
            aria-label={`Details for subscription ${subscription.display_name}`}
            tabIndex={0} // Make card focusable
        >
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                        {subscription.display_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        ({subscription.subscription_id})
                    </Typography>
                </Box>

                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250, width: '100%' }}>
                        <CircularProgress />
                    </Box>
                ) : error ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250, width: '100%' }}>
                        <Typography color="error" variant="body2">Failed to load data: {error}</Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
                        <Box sx={{ flex: 1, minWidth: '150px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>Top 5 Resource Groups</Typography>
                            {topResourceGroups.length > 0 ? (
                                <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                                    {topResourceGroups.map(([rgName, rgCost], index) => (
                                       <li key={index} style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between' }}>
                                            <span title={rgName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>
                                                {rgName}
                                            </span>
                                            <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                {`$${rgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                            </span>
                                        </li>
                                    ))}
                                    {Array(Math.max(0, 5 - topResourceGroups.length)).fill(null).map((_, i) => (
                                         <li key={`blank-${i}`} style={{ fontSize: '0.875rem', height: '1.25rem' }}>&nbsp;</li> // Blank rows
                                    ))}
                                </ul>
                            ) : (
                                <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>
                                    No resource groups to display.
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ flex: 2 }}>
                            <Box sx={{ mb: 1, textAlign: 'right' }}>
                                <Typography variant="body2">
                                    Actual: <strong>{costData?.total_cost != null ? `$${costData.total_cost.toLocaleString()}` : 'N/A'}</strong>
                                </Typography>
                                <Typography variant="body2">
                                    Forecast (EOM): <strong>{costData?.projected_cost_current_month != null ? `$${costData.projected_cost_current_month.toLocaleString()}` : 'N/A'}</strong>
                                </Typography>
                            </Box>
                            {finalChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart 
                                        data={finalChartData}
                                        margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                                        aria-label={`Actual and Forecasted Spend chart for ${subscription.display_name}`}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tickFormatter={formatYAxis} domain={yAxisDomain} tick={{ fontSize: 10 }} allowDataOverflow={true}/>
                                        <Tooltip formatter={customTooltipFormatterSubscriptionBlock} />
                                        <Legend wrapperStyle={{ fontSize: "12px" }} iconType='circle'/>
                                        <Area type="monotone" dataKey="Actual" stroke="rgb(87, 148, 255)" fillOpacity={1.0} fill="rgb(87, 148, 255)" strokeWidth={2} activeDot={{ r: 5 }} dot={false} name="Actual" connectNulls={false} />
                                        <Area type="monotone" dataKey="Forecast" strokeOpacity={0.3} stroke="rgb(71, 211, 255)" fillOpacity={0.3} fill="rgb(71, 211, 255)" strokeDasharray="5 5" strokeWidth={2} activeDot={{ r: 5 }} dot={false} name="Forecast" connectNulls={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                 <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: '4px' }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Data unavailable for chart.</Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

export default SubscriptionBlock;