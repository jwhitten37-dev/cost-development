// src/components/CostDisplay.js
import React from 'react';
import CostBreakdownChart from './CostBreakdownChart';
import './CostDisplay.css';

function CostDisplay({ costData, onResourceGroupSelect, selectedResourceGroup }) {
    if (!costData) return null;

    const {
        subscription_id,
        subscription_name,
        total_cost,
        currency,
        costs_by_resource_group, // Already filtered by "caz-" from backend
        // detailed_entries, // No longer primarily used for a table in this component's main view
        timeframe_used,
        from_date_used,
        to_date_used,
        granularity_used,
        projected_cost_current_month,
        // resource_group_name prop is not expected here for main subscription view
    } = costData;

    const chartDataForRGDisplay = (costs_by_resource_group && Object.keys(costs_by_resource_group).length > 0)
        ? Object.entries(costs_by_resource_group).map(([key, costVal]) => ({
            key: key,
            displayName: key,
            totalCost: costVal,
            currency: currency
        })).reduce((acc, item) => { acc[item.key] = item; return acc; }, {})
        : null;

    const viewTitleText = `Subscription: ${subscription_name} (${subscription_id})`;
    const totalCostString = (total_cost !== undefined)
        ? `Total Cost: $${total_cost?.toFixed(2)} ${currency}`
        : null;

    return (
        <div className="cost-display-section">
            <div className="cost-view-header">
                <span className="view-title">{viewTitleText}</span>
                {totalCostString && <span className="view-total-cost">{totalCostString}</span>}
            </div>

            <p className="view-meta-info">
                Timeframe: {timeframe_used}
                {timeframe_used === 'Custom' && ` (${from_date_used || 'N/A'} to ${to_date_used || 'N/A'})`}
                , Granularity: {granularity_used}
                {projected_cost_current_month !== null && projected_cost_current_month !== undefined && (
                    <><br/>Projected (Month End): ${projected_cost_current_month?.toFixed(2)} {currency}</>
                )}
            </p>

            <div className="cost-display-layout">
                <div className="cost-list-area">
                    {costs_by_resource_group && Object.keys(costs_by_resource_group).length > 0 ? (
                        <div className="resource-group-summary">
                            <h4>Costs by Resource Group:</h4>
                            <ul>
                                {Object.entries(costs_by_resource_group).map(([rg, cost]) => (
                                    <li key={rg}
                                        onClick={() => onResourceGroupSelect(rg)}
                                        className={selectedResourceGroup === rg ? 'selected' : ''}
                                        tabIndex={0} // Make it focusable
                                        onKeyDown={(e) => e.key === 'Enter' && onResourceGroupSelect(rg)} // Keyboard accessible
                                    >
                                        {rg}: ${cost.toFixed(2)} {currency}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <p>No resource group costs to display for this selection.</p>
                    )}
                </div>

                {chartDataForRGDisplay && Object.keys(chartDataForRGDisplay).length > 0 && (
                    <div className="cost-chart-area">
                        <CostBreakdownChart
                            chartTitle="Resource Group Cost Distribution"
                            dataToDisplay={chartDataForRGDisplay}
                        />
                    </div>
                )}
            </div>
            {/* The detailed_entries table is intentionally removed from this component's direct rendering */}
            {/* ProviderBreakdownView will be rendered by App.js separately */}
        </div>
    );
}

export default CostDisplay;