// src/pages/SubscriptionOverviewPage.js
import React, { useState, useMemo, useEffect } from 'react';
// Import Link from react-router-dom to enable navigation
import { Link } from 'react-router-dom';
import {
    Typography,
    Paper,
    Grid,
    Button,
    Box,
    TextField,
    IconButton,
    InputAdornment,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import SubscriptionBlock from '../components/SubscriptionBlock';
import FilterBar from '../components/FilterBar/FilterBar';
import './SubscriptionOverviewPage.css';

// A custom tick component for the XAxis to handle multi-line labels and positioning.
const CustomXAxisTick = (props) => {
    const { x, y, payload, textAnchor, angle, verticalOffset, style, className, fill } = props;
    const { value } = payload;

    return (
        <g transform={`translate(${x},${y})`}>
            <text
                x={0} // Relative to the group's origin
                y={verticalOffset} // Apply vertical offset here to move labels away from the axis line
                textAnchor={textAnchor} // Use the textAnchor passed from XAxis
                transform={`rotate(${angle})`} // Apply the angle passed from XAxis
                style={style} // Pass style explicitly
                className={className} // Pass className explicitly
                fill={fill || '#666'} // Pass fill explicitly, with a fallback color for the text
            >
                {typeof value === 'string' && value.includes('\n') ? (
                    value.split('\n').map((line, index) => (
                        // tspan dy values are relative to the previous tspan or text element
                        <tspan x={0} dy={index === 0 ? 0 : '1.2em'} key={index}>{line}</tspan>
                    ))
                ) : (
                    value
                )}
            </text>
        </g>
    );
};

// Helper to format Y-axis ticks as currency
const formatTooltipCurrency = (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const customTooltipFormatter = (value, name, props) => {
    const { payload } = props;
    
    if (name === "Actual Cost") {
        return value !== null ? formatTooltipCurrency(value) : null;
    }

    if (name === "Forecast Cost") {
        // For YTD, the forecast value is already null for past months, so this won't be called for that series.
        // This logic is specifically for MTD and QTD where we backfill the forecast for visual continuity.
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date to midnight for accurate comparison

        // Check for MTD data point (has a 'date' string)
        if (payload.date) {
            const pointDate = new Date(payload.date + 'T00:00:00');
            if (pointDate < today) {
                return null; // Don't show forecast for past days
            }
        }
        // Check for QTD data point (has a 'firstDateInWeek' object)
        else if (payload.firstDateInWeek) {
            const lastDayOfWeek = new Date(payload.firstDateInWeek);
            lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6);
            if (lastDayOfWeek < today) {
                return null; // Don't show forecast for past weeks
            }
        }
        
        const forecastValue = payload._eomForecastForTooltip;
        return forecastValue !== null ? formatTooltipCurrency(forecastValue) : null;
    }

    return value !== null ? formatTooltipCurrency(value) : null;
};

const getBudgetColor = (forecastCost, budget) => {
    if (budget === null || isNaN(budget)) {
        return 'text.primary'; // Default color if no budget is set or invalid
    }

    const underBudgetThreshold = 5000;
    const overBudgetThreshold = 5000;
    const significantlyOverBudgetThreshold = 10000;

    const difference = forecastCost - budget;

    if (difference <= -underBudgetThreshold) {
        // Green: $5,000 or more under budget
        return 'green';
    } else if (difference > -underBudgetThreshold && difference <= overBudgetThreshold) {
        // Yellow: within $5,000 under to $5,000 over budget
        return 'orange'; // Using orange for yellow-ish
    } else if (difference > overBudgetThreshold && difference <= significantlyOverBudgetThreshold) {
        // Orange: $5,000 to $10,000 over budget
        return 'darkorange';
    } else {
        // Red: $10,000 or more over budget
        return 'red';
    }
};

const AggregateDataSection = ({ subscriptions, unfilteredOverviewData }) => {
    const [aggregateTimeframe, setAggregateTimeframe] = useState('YTD'); // Default to YTD for a broader view
    const [budget, setBudget] = useState(null); // Stores the set budget (numeric). Will be initialized from localStorage.
    const [isEditingBudget, setIsEditingBudget] = useState(false); // Controls visibility of budget input field
    const [budgetInputValue, setBudgetInputValue] = useState(''); // Value of the budget input field

    // Load budget from localStorage on initial component mount
    useEffect(() => {
        const storedBudget = localStorage.getItem('costAppBudget');
        if (storedBudget) {
            const numericStoredBudget = parseFloat(storedBudget);
            if (!isNaN(numericStoredBudget)) {
                setBudget(numericStoredBudget);
            }
        }
    }, []); // Empty dependency array ensures this runs only once on mount

    const handleSetBudget = () => {
        const numericBudget = parseFloat(budgetInputValue);
        setBudget(isNaN(numericBudget) ? null : numericBudget);
        setIsEditingBudget(false); // Hide input after setting or clearing
        // Store budget in localStorage
        if (!isNaN(numericBudget)) {
            localStorage.setItem('costAppBudget', numericBudget.toString());
        } else {
            localStorage.removeItem('costAppBudget'); // Remove the item if the budget is cleared or invalid
        }
    };

    const handleEditBudget = () => {
        setBudgetInputValue(budget !== null ? budget.toString() : ''); // Pre-fill with current budget if exists
        setIsEditingBudget(true); // Show input field
    };

    const monthOrder = useMemo(() => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], []);

    const selectedPeriodDefinition = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11

        let startPeriodYear, startPeriodMonth, endPeriodYear, endPeriodMonth;

        switch (aggregateTimeframe) {
            case 'MTD':
                startPeriodYear = currentYear;
                startPeriodMonth = currentMonth;
                endPeriodYear = currentYear;
                endPeriodMonth = currentMonth;
                break;
            case 'QTD':
                const currentQuarter = Math.floor(currentMonth / 3);
                startPeriodMonth = currentQuarter * 3;
                endPeriodMonth = startPeriodMonth + 2;
                startPeriodYear = currentYear;
                endPeriodYear = currentYear;
                break;
            case 'YTD':
            default: // Default to YTD
                startPeriodMonth = 0; // January
                endPeriodMonth = 11; // December
                startPeriodYear = currentYear;
                endPeriodYear = currentYear;
                break;
        }
        return { startPeriodYear, startPeriodMonth, endPeriodYear, endPeriodMonth };
    }, [aggregateTimeframe]);

    const processedData = useMemo(() => {
        if (!subscriptions || subscriptions.length === 0) {
            return { periodActualCost: 0, periodProjectedCost: 0, finalAreaChartData: [], loadedSubsForAggregates: 0, totalResourceGroups: 0 };
        }

        let totalPeriodActualCost = 0;
        let totalPeriodProjectedCost = 0;
        let loadedSubsForAggregates = 0;
        let globalTotalResourceGroups = 0;

        const now = new Date();
        const currentActualYear = now.getFullYear();
        const currentActualMonthIndex = now.getMonth();

        subscriptions.forEach(sub => {
            const subData = unfilteredOverviewData[sub.subscription_id]?.data;
            if (subData) {
                loadedSubsForAggregates++;
                if (subData.costs_by_resource_group) {
                    globalTotalResourceGroups += Object.keys(subData.costs_by_resource_group).length;
                }

                subData.yearly_monthly_breakdown?.forEach(item => {
                    const itemMonthIndex = monthOrder.indexOf(item.month);
                    const itemYear = item.year;

                    if (itemMonthIndex === -1) return;

                    const { startPeriodYear, startPeriodMonth, endPeriodYear, endPeriodMonth } = selectedPeriodDefinition;

                    const isInPeriod =
                        itemYear >= startPeriodYear && itemYear <= endPeriodYear &&
                        itemMonthIndex >= (itemYear === startPeriodYear ? startPeriodMonth : 0) &&
                        itemMonthIndex <= (itemYear === endPeriodYear ? endPeriodMonth : 11);

                    if (isInPeriod) {
                        if (item.actual !== null) {
                            totalPeriodActualCost += item.actual;
                        }

                        // For totalPeriodProjectedCost: sum past actuals and future/current forecasts
                        if (itemYear < currentActualYear || (itemYear === currentActualYear && itemMonthIndex < currentActualMonthIndex)) {
                            if (item.actual !== null) totalPeriodProjectedCost += item.actual;
                        } else { // Current or future month within the period
                            if (item.forecast !== null) {
                                totalPeriodProjectedCost += item.forecast;
                            } else if (itemYear === currentActualYear && itemMonthIndex === currentActualMonthIndex && item.actual !== null) {
                                // If current month has actual but no forecast, use actual for projection for this month
                                totalPeriodProjectedCost += item.actual;
                            }
                        }
                    }
                });
            }
        });
    
        let finalAreaChartData = [];

        if (aggregateTimeframe === 'YTD') {
            const monthlyAggregated = {};
            subscriptions.forEach(sub => {
                const subData = unfilteredOverviewData[sub.subscription_id]?.data;
                if (subData?.yearly_monthly_breakdown) {
                    subData.yearly_monthly_breakdown.forEach(item => {
                        const key = `${item.month}-${item.year}`;
                        if (!monthlyAggregated[key]) {
                            monthlyAggregated[key] = { month: item.month, year: item.year, totalActual: null, totalForecast: null };
                        }
                        if (item.actual !== null) monthlyAggregated[key].totalActual = (monthlyAggregated[key].totalActual || 0) + item.actual;
                        if (item.forecast !== null) monthlyAggregated[key].totalForecast = (monthlyAggregated[key].totalForecast || 0) + item.forecast;
                    });
                }
            });

            const areaChartData = Object.values(monthlyAggregated).sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
            }).map(item => ({
                name: item.month,
                Actual: item.totalActual,
                _eomForecastForTooltip: item.totalForecast
            }));

            let lastActualPointIndex = -1;
            for (let i = areaChartData.length - 1; i >= 0; i--) {
                if (areaChartData[i].Actual !== null) { lastActualPointIndex = i; break; }
            }
            finalAreaChartData = areaChartData.map((point, index) => {
                let forecastSeriesValue = null;
                if (lastActualPointIndex === -1) { // No actuals at all
                    forecastSeriesValue = point._eomForecastForTooltip;
                } else if (lastActualPointIndex === 0) { // First point is actual, no previous to connect
                    if (index >= lastActualPointIndex) { // Show forecast from this point on
                        forecastSeriesValue = point._eomForecastForTooltip;
                    }
                } else { // lastActualPointIndex > 0, can connect from previous
                    if (index === lastActualPointIndex - 1) {
                        forecastSeriesValue = point.Actual;
                    } else if (index >= lastActualPointIndex) {
                        forecastSeriesValue = point._eomForecastForTooltip;
                    }
                }
                return { ...point, Forecast: forecastSeriesValue };
            });
        } else { // MTD or QTD logic (daily)
            const dailyAggregated = {};
            const { startPeriodYear, startPeriodMonth, endPeriodMonth } = selectedPeriodDefinition;
            const periodStart = new Date(startPeriodYear, startPeriodMonth, 1);
            const periodEnd = new Date(startPeriodYear, endPeriodMonth + 1, 0); // Day 0 of next month is last day of current

            subscriptions.forEach(sub => {
                const subData = unfilteredOverviewData[sub.subscription_id]?.data;
                if (subData?.yearly_daily_breakdown) {
                    subData.yearly_daily_breakdown.forEach(entry => {
                        const entryDate = new Date(entry.date + 'T00:00:00'); // Use T00:00:00 to avoid timezone issues
                        if (entryDate >= periodStart && entryDate <= periodEnd) {
                            if (!dailyAggregated[entry.date]) {
                                dailyAggregated[entry.date] = { date: entry.date, Actual: null, _eomForecastForTooltip: null };
                            }
                            if (entry.entry_type === 'actual') {
                                dailyAggregated[entry.date].Actual = (dailyAggregated[entry.date].Actual || 0) + entry.amount;
                            } else if (entry.entry_type === 'forecast') {
                                dailyAggregated[entry.date]._eomForecastForTooltip = (dailyAggregated[entry.date]._eomForecastForTooltip || 0) + entry.amount;
                            }
                        }
                    });
                }
            });

            const sortedDailyData = Object.values(dailyAggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

            if (aggregateTimeframe === 'MTD') {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth(); // 0-11
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                const monthShortName = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();

                // Create a template for all days of the current month.
                const monthTemplate = Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(Date.UTC(currentYear, currentMonth, day));
                    const dateString = date.toISOString().split('T')[0];
                    
                    let name;
                    if (day === 1 || day === daysInMonth) {
                        name = `${monthShortName} ${day}`;
                    } else {
                        name = day.toString();
                    }

                    return { date: dateString, name: name, Actual: null, Forecast: null, _eomForecastForTooltip: null };
                });

                // Create a Map for efficient lookup of fetched data
                const dailyDataMap = new Map(sortedDailyData.map(d => [d.date, d]));
                
                // Populate the template with actual data from the API
                let fullMonthData = monthTemplate.map(dayTemplate => {
                    const dataForDay = dailyDataMap.get(dayTemplate.date);
                    if (dataForDay) {
                        return { ...dayTemplate, Actual: dataForDay.Actual, _eomForecastForTooltip: dataForDay._eomForecastForTooltip };
                    }
                    return dayTemplate;
                });
                
                let lastActualDailyIndex = -1;
                for (let i = fullMonthData.length - 1; i >= 0; i--) {
                    if (fullMonthData[i].Actual !== null) {
                        lastActualDailyIndex = i;
                        break;
                    }
                }

                finalAreaChartData = fullMonthData.map((point, index) => {
                    let forecastSeriesValue = null;
                    if (lastActualDailyIndex === -1) {
                        forecastSeriesValue = point._eomForecastForTooltip;
                    } else if (lastActualDailyIndex === 0) {
                        if (index >= lastActualDailyIndex) {
                            forecastSeriesValue = point._eomForecastForTooltip;
                        }
                    } else {
                        if (index === lastActualDailyIndex - 1) {
                            forecastSeriesValue = point.Actual;
                        } else if (index >= lastActualDailyIndex) {
                            forecastSeriesValue = point._eomForecastForTooltip;
                        }
                    }
                    return { ...point, Forecast: forecastSeriesValue };
                });
            } else if (aggregateTimeframe === 'QTD') {
                // 1. Generate a complete template for all weeks in the quarter.
                const { startPeriodYear, startPeriodMonth, endPeriodMonth } = selectedPeriodDefinition;
                const quarterStartDate = new Date(Date.UTC(startPeriodYear, startPeriodMonth, 1));
                const quarterEndDate = new Date(Date.UTC(startPeriodYear, endPeriodMonth + 1, 0));

                const quarterTemplate = [];
                let currentWeek = -1;
                let lastMonthName = '';

                const getWeekNumber = (d) => {
                    const date = new Date(d.getTime());
                    date.setHours(0, 0, 0, 0);
                    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
                    const week1 = new Date(date.getFullYear(), 0, 4);
                    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
                };

                for (let d = new Date(quarterStartDate); d <= quarterEndDate; d.setDate(d.getDate() + 1)) {
                    const weekNumber = getWeekNumber(d);
                    if (weekNumber !== currentWeek) {
                        currentWeek = weekNumber;
                        const monthName = d.toLocaleString('en-US', { month: 'short' });
                        let weekLabel = `Week ${weekNumber}`;

                        if (monthName !== lastMonthName) {
                            weekLabel = `${monthName}\n${weekLabel}`;
                            lastMonthName = monthName;
                        }

                        quarterTemplate.push({
                            key: `${d.getFullYear()}-W${weekNumber}`,
                            name: weekLabel,
                            firstDateInWeek: new Date(d),
                            Actual: null,
                            Forecast: null,
                            _eomForecastForTooltip: null
                        });
                    }
                }

                // 2. Aggregate fetched data into weekly buckets
                const weeklyDataMap = new Map();
                sortedDailyData.forEach(d => {
                    const date = new Date(d.date + 'T00:00:00');
                    const weekNumber = getWeekNumber(date);
                    const key = `${date.getFullYear()}-W${weekNumber}`;

                    if (!weeklyDataMap.has(key)) {
                        weeklyDataMap.set(key, { Actual: 0, _eomForecastForTooltip: 0 });
                    }
                    const weekData = weeklyDataMap.get(key);
                    if (d.Actual !== null) weekData.Actual += d.Actual;
                    if (d._eomForecastForTooltip !== null) weekData._eomForecastForTooltip += d._eomForecastForTooltip;
                });

                // 3. Map aggregated data onto the template
                let fullQuarterData = quarterTemplate.map(weekTemplate => {
                    const dataForWeek = weeklyDataMap.get(weekTemplate.key);
                    if (dataForWeek) {
                        const actual = dataForWeek.Actual > 0 ? dataForWeek.Actual : null;
                        const forecast = dataForWeek._eomForecastForTooltip > 0 ? dataForWeek._eomForecastForTooltip : null;
                        return { ...weekTemplate, Actual: actual, _eomForecastForTooltip: forecast };
                    }
                    return weekTemplate;
                });

                // 4. Apply the forecast anchoring logic to the complete data set
                let lastActualWeeklyIndex = -1;
                for (let i = fullQuarterData.length - 1; i >= 0; i--) {
                    if (fullQuarterData[i].Actual !== null) { lastActualWeeklyIndex = i; break; }
                }

                finalAreaChartData = fullQuarterData.map((point, index) => {
                    let forecastSeriesValue = null;
                    if (lastActualWeeklyIndex === -1) {
                        forecastSeriesValue = point._eomForecastForTooltip;
                    } else if (lastActualWeeklyIndex === 0) {
                        if (index >= lastActualWeeklyIndex) {
                            forecastSeriesValue = point._eomForecastForTooltip;
                        }
                    } else {
                        if (index === lastActualWeeklyIndex - 1) {
                            forecastSeriesValue = point.Actual;
                        } else if (index >= lastActualWeeklyIndex) {
                            forecastSeriesValue = point._eomForecastForTooltip;
                        }
                    }
                    return { ...point, Forecast: forecastSeriesValue };
                });
            }
        }

        return { periodActualCost: totalPeriodActualCost, periodProjectedCost: totalPeriodProjectedCost, finalAreaChartData, loadedSubsForAggregates, totalResourceGroups: globalTotalResourceGroups };

    }, [subscriptions, unfilteredOverviewData, monthOrder, selectedPeriodDefinition, aggregateTimeframe]);

    const { periodActualCost, periodProjectedCost, finalAreaChartData, loadedSubsForAggregates, totalResourceGroups } = processedData;

    if (!subscriptions || subscriptions.length === 0) {
        return null;
    }

    let totalSubsCount = subscriptions.length;
    const avgResourceGroupsPerSub = totalSubsCount > 0 ? (totalResourceGroups / totalSubsCount).toFixed(1) : 0;
    
    if (loadedSubsForAggregates < totalSubsCount) {
        // Optionally render a loading state or partial data indication
        // For now, we'll show what's loaded.
    }

    return (
        <Paper elevation={3} className="aggregate-data-section">
            <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>
                Aggregated Cost Analysis
            </Typography>
            <Grid container spacing={5} alignItems="stretch" 
                  sx={{ '& > .MuiGrid-item': { display: 'flex' } }} 
            >
           
                {/* Stat boxes take md={2} each, chart takes md={4}. Total 4*2 + 4 = 12 columns. */}
                <Grid item xs={12} sm={6} md={2}> 
                    <Paper sx={{p:2, textAlign:'center', width: '100%', height: '250px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                        <Typography variant="h6">{totalSubsCount}</Typography>
                        <Typography>Total Subscriptions</Typography>
                    </Paper> 
                </Grid>
                <Grid item xs={12} sm={6} md={2}> 
                    <Paper sx={{p:2, textAlign:'center', width: '100%', height: '250px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                        <Typography variant="h6">{totalResourceGroups} / {avgResourceGroupsPerSub} avg</Typography>
                        <Typography>Total RGs / Avg per Sub</Typography>
                    </Paper> 
                </Grid>
                <Grid item xs={12} sm={6} md={2} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Paper sx={{p:2, textAlign:'center', width: '100%', height: '70px', display: 'flex', flexDirection: 'column', justifyContent: 'center', mb: 0.5 }}>
                        <Typography>Actual Cost ({aggregateTimeframe})</Typography>
                        <Typography variant="h6">{formatTooltipCurrency(periodActualCost)}</Typography>
                    </Paper>
                    <Paper sx={{p:2, textAlign:'center', width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '176px' }}>
                        <Typography>Forecasted Cost ({aggregateTimeframe})</Typography>
                        <Typography variant="h6" sx={{ color: getBudgetColor(periodProjectedCost, budget), transition: 'color 0.3s ease' }}>
                            {formatTooltipCurrency(periodProjectedCost)}
                        </Typography>
                        {isEditingBudget ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1, px: 1 }}>
                                <TextField
                                    label="Budget"
                                    size="small"
                                    value={budgetInputValue}
                                    onChange={(e) => setBudgetInputValue(e.target.value)}
                                    sx={{ maxWidth: '150px' }}
                                    type="number"
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                />
                                <IconButton size="small" onClick={handleSetBudget} aria-label="Apply Budget"><CheckIcon /></IconButton>
                            </Box>
                        ) : budget !== null ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1 }}>
                                <Typography variant="body2" sx={{ mr: 1 }}>Budget: {formatTooltipCurrency(budget)}</Typography>
                                <IconButton size="small" onClick={handleEditBudget} aria-label="Edit Budget"><EditIcon fontSize="small" /></IconButton>
                            </Box>
                        ) : (
                            <Button size="small" onClick={() => setIsEditingBudget(true)} sx={{ mt: 1 }}>Set Budget</Button>
                        )}
                    </Paper>
                </Grid>
                
                {/* Area Chart in the same row */}
                <Grid item xs={12} sm={12} md={4} sx={{ minWidth: 0 }}>
                    <Paper sx={{p:1, width: '99%', height: '265px', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ flexGrow: 1, width: '100%', height: 'calc(100% - 40px)' }}>
                            {finalAreaChartData && finalAreaChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={finalAreaChartData}
                                        margin={{ top: 5, right: 10, left: 0, bottom: 5 }} // Reduced bottom margin for buttons
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="name"
                                            height={55}
                                            interval={0}
                                            tick={<CustomXAxisTick
                                                angle={finalAreaChartData.length > 7 ? -45 : 0} // Rotate if many points
                                                textAnchor={finalAreaChartData.length > 7 ? "end" : "middle"} // "end" for rotated, "middle" for straight
                                                verticalOffset={10} // Adjust this value as needed to move labels away from the axis line
                                                style={{ fontSize: '0.7rem' }}
                                            />}
                                        />
                                        <YAxis tickFormatter={formatTooltipCurrency} tick={{ fontSize: '0.7rem' }} width={70} allowDataOverflow={true} />
                                        <Tooltip formatter={customTooltipFormatter} />
                                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: "10px", paddingTop: '5px', paddingBottom: '10px' }} iconType='circle'/>
                                        <Area type="monotone" dataKey="Actual" stroke="rgb(87, 148, 255)" fillOpacity={1.0} fill="rgb(87, 148, 255)" strokeWidth={2} activeDot={{ r: 6 }} dot={false} name="Actual Cost" connectNulls={false} />
                                        <Area type="monotone" dataKey="Forecast" strokeOpacity={0.3} stroke="rgb(71, 211, 255)" fillOpacity={0.3} fill="rgb(71, 211, 255)" strokeDasharray="5 5" strokeWidth={2} activeDot={{ r: 6 }} dot={false} name="Forecast Cost" connectNulls={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <Typography variant="caption" sx={{textAlign: 'center', pt: 2}}>
                                    {loadedSubsForAggregates < totalSubsCount
                                        ? "Aggregated cost data loading..."
                                        : `No aggregated cost data for ${aggregateTimeframe} to display in chart.`}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1, height: '30px', flexShrink: 0 }}>
                            <Button size="small" variant={aggregateTimeframe === 'MTD' ? 'contained' : 'outlined'} onClick={() => setAggregateTimeframe('MTD')}>MTD</Button>
                            <Button size="small" variant={aggregateTimeframe === 'QTD' ? 'contained' : 'outlined'} onClick={() => setAggregateTimeframe('QTD')}>QTD</Button>
                            <Button size="small" variant={aggregateTimeframe === 'YTD' ? 'contained' : 'outlined'} onClick={() => setAggregateTimeframe('YTD')}>YTD</Button>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
            {/* Add the Compare Subscriptions button below the grid */}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, pt: 3, flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2}}>
                    <Button component={Link} to="/compare" variant="contained" color="primary" size="large">
                        Compare Subscriptions
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

function SubscriptionOverviewPage({ 
    subscriptions, 
    overviewData, 
    unfilteredOverviewData, 
    onSubscriptionBlockClick, 
    globalTimeframeParams,
    activeFilters,
    onAddFilter,
    onRemoveFilter,
    subscriptionGroups,
    selectedGroup,
    onGroupChange
}) {
    // console.log("SubscriptionOverviewPage: Received overviewData prop:", overviewData);
    // console.log("SubscriptionOverviewPage: Received unfilteredOverviewData prop:", unfilteredOverviewData);

    const groupSelector = (
        <Paper sx={{ display: 'flex', justifyContent: 'center', p: 1, mb: 2, mt: 2, backgroundColor: 'transparent', boxShadow: 'none' }}>
            <FormControl sx={{ m: 1, minWidth: 240 }}>
                <InputLabel id='sub-group-select-label'>Subscription Group</InputLabel>
                <Select
                    labelId='sub-group-select-label'
                    id='sub-group-select'
                    value={selectedGroup || ''}
                    label='Subscription Group'
                    onChange={(e) => onGroupChange(e.target.value)}
                >
                    {subscriptionGroups.map(group => (
                        <MenuItem key={group} value={group}>{group}</MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Paper>
    );
    
    if (!subscriptions || subscriptions.length === 0) {
        // If no subscriptions match the filter, but groups are available, show a different message.
        if (subscriptionGroups && subscriptionGroups.length > 1) { // >1 because 'All' is always there
            return (
                <div className="subscription-overview-page">
                    {groupSelector}
                    <p className="info-message">No subscriptions found for the selected group '{selectedGroup}'.</p>
                </div>
            );
        }
        return <p className="info-message">No subscriptions discovered or accessible to display in overview.</p>;
    }

    return (
        <div className="subscription-overview-page">
            {groupSelector}
            <AggregateDataSection
                subscriptions={subscriptions}
                unfilteredOverviewData={unfilteredOverviewData}
            />

            {/* FilterBar for Overview Page - rendered by SubscriptionOverviewPage */}
            <FilterBar
                activeFilters={activeFilters}
                onAddFilter={onAddFilter}
                onRemoveFilter={onRemoveFilter}
                currentSubscriptionId={null} // On overview, no single current sub for tag discovery context
                                             // Tag discovery in FilterBar defaults to DEV_SUBSCRIPTION_ID_FOR_TAGS
            />

            <Typography variant="h5" component="h2" sx={{ marginTop: 4, marginBottom: 2, textAlign: 'center' }}>
                Individual Subscription Details
            </Typography>
            <div className="subscription-blocks-container">
                {subscriptions.map(sub => {
                    const subData = overviewData[sub.subscription_id];
                    return (
                        <SubscriptionBlock
                            key={sub.subscription_id}
                            subscription={sub}
                            costData={subData?.data} // The actual cost data object
                            isLoading={subData?.isLoading} // Boolean to indicate loading
                            error={subData?.error} // Error message string if fetch failed
                            onClick={() => onSubscriptionBlockClick(sub.subscription_id)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export default SubscriptionOverviewPage;