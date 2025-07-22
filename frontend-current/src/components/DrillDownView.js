// src/components/DrillDownView.js
import React from 'react';
import CostBreakdownChart from './CostBreakdownChart';
import './DrillDownView.css';

function DrillDownView({ drillDownState, onDrillDown, onBreadcrumbClick, onExitDrillDown }) {
    const { resourceGroupName, path, data, currentLevelEntries } = drillDownState;

    let currentLevelName = "Providers";
    if (path.length === 1) currentLevelName = `Breakdown in ${path[0]}`;
    else if (path.length > 1) currentLevelName = `Breakdown in ${path[path.length -1]}`;

    // Data for chart will be `drillDownState.data`
    // The `data` object in drillDownState is already in a suitable format:
    // { key1: { displayName, totalCost, currency, ... }, key2: ... }
    const chartTitle = `${currentLevelName} Costs`;

    // Check if data is for a leaf node (single item)
    const isLeafView = Object.keys(data).length === 1 && data[Object.keys(data)[0]]?.isLeaf;


    return (
        <div className="drill-down-section"> {}
            <h3>Drill-down for Resource Group: {resourceGroupName}</h3>
            <div className="breadcrumbs">
                <span onClick={() => onBreadcrumbClick(-1)} className="breadcrumb-item">
                    {resourceGroupName}
                </span>
                {path.map((segmentDisplayName, index) => (
                    <React.Fragment key={index}>
                        {' > '}
                        <span onClick={() => onBreadcrumbClick(index)} className="breadcrumb-item">
                            {segmentDisplayName}
                        </span>
                    </React.Fragment>
                ))}
            </div>
            <button onClick={onExitDrillDown} className="exit-drilldown-button">Back to Subscription Overview</button>

            <div className="drilldown-content-layout"> {/* Flex container */}
                <div className="drilldown-list-area">
                    <h4>{currentLevelName}</h4>
                    {Object.keys(data).length > 0 ? (
                        <ul className="drill-down-list">
                            {Object.entries(data).map(([key, value]) => (
                                <li key={key} onClick={() => !value.isLeaf && onDrillDown(key)}>
                                    {value.displayName || key}: {value.totalCost?.toFixed(2)} {value.currency}
                                    {!value.isLeaf && " (Click to drill down)"}
                                    {value.isLeaf && " (Final item cost details below)"}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>No further breakdown available for this selection, or no costs found.</p>
                    )}

                    {/* If it's a leaf node, you might want to show its specific entries */}
                    {isLeafView && data[Object.keys(data)[0]]?.entries?.length > 0 && (
                        <div className="detailed-costs leaf-node-details">
                            <h4>Detailed Entries for {data[Object.keys(data)[0]].displayName}</h4>
                            <table>
                                <thead>
                                    <tr><th>Date</th><th>Amount</th><th>Currency</th><th>Resource ID</th></tr>
                                </thead>
                                <tbody>
                                    {data[Object.keys(data)[0]].entries.map((entry, idx) => (
                                        <tr key={idx}>
                                            <td>{entry.date || 'N/A'}</td>
                                            <td>{entry.amount.toFixed(2)}</td>
                                            <td>{entry.currency}</td>
                                            <td>{entry.resourceId || 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {!isLeafView && Object.keys(data).length > 0 && ( // <<< RENDER CHART for non-leaf
                     <div className="drilldown-chart-area">
                        <CostBreakdownChart
                            chartTitle={chartTitle}
                            dataToDisplay={data}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default DrillDownView;