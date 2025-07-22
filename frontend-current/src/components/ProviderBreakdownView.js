// src/components/ProviderBreakdownView.js
import React, { useState } from 'react';
import CostBreakdownChart from './CostBreakdownChart';
import './ProviderBreakdownView.css';
import { parseAzureResourceId } from '../utils/resourceIdParser'; // We'll use this to get a friendlier resource name

function ProviderBreakdownView({ resourceGroupName, providersData, onClear }) {
    const [expandedProviders, setExpandedProviders] = useState({}); // Stores { providerKey: boolean }

    if (!providersData || Object.keys(providersData).length === 0) {
        return (
            <div className="provider-breakdown-section">
                <h4>Providers in {resourceGroupName}</h4>
                <p>No provider cost data available for this resource group or selection.</p>
                {onClear && <button onClick={onClear} className="clear-provider-view-button">&times; Hide Providers</button>}
            </div>
        );
    }

    const toggleProviderExpansion = (providerKey) => {
        setExpandedProviders(prevExpanded => ({
            ...prevExpanded,
            [providerKey]: !prevExpanded[providerKey]
        }));
    };

    const chartTitle = `Provider Cost Distribution in ${resourceGroupName}`;

    return (
        <div className="provider-breakdown-section">
            <div className="provider-header">
                <h4>Providers in {resourceGroupName}</h4>
                {onClear && 
                    <button onClick={onClear} className="clear-provider-view-button" aria-label={`Hide providers for ${resourceGroupName}`}>
                        &times; Hide Providers
                    </button>
                }
            </div>
            <div className="provider-content-layout">
                <div className="provider-table-area">
                    <table>
                        <thead>
                            <tr>
                                <th className="expand-column-header"></th> {/* For expand icon */}
                                <th>Provider</th>
                                <th>Total Cost</th>
                                <th>Resource Entries</th> {/* Reflects number of cost entries */}
                                <th>Currency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(providersData).map(([providerKey, data]) => (
                                <React.Fragment key={providerKey}>
                                    <tr 
                                        className={`provider-row ${data.entries && data.entries.length > 0 ? 'expandable' : ''}`}
                                        onClick={() => data.entries && data.entries.length > 0 && toggleProviderExpansion(providerKey)}
                                        tabIndex={data.entries && data.entries.length > 0 ? 0 : -1} // Make focusable if expandable
                                        onKeyDown={(e) => data.entries && data.entries.length > 0 && e.key === 'Enter' && toggleProviderExpansion(providerKey)}
                                    >
                                        <td className="expand-cell">
                                            {data.entries && data.entries.length > 0 ? (
                                                expandedProviders[providerKey] ? '▼' : '►' // Down arrow for expanded, right for collapsed
                                            ) : ''}
                                        </td>
                                        <td>{data.displayName}</td>
                                        <td>{data.totalCost.toFixed(2)}</td>
                                        <td>{data.count}</td> {/* This is data.entries.length */}
                                        <td>{data.currency}</td>
                                    </tr>
                                    {expandedProviders[providerKey] && data.entries && data.entries.map((entry, index) => {
                                        const parsedId = parseAzureResourceId(entry.resourceId);
                                        let resourceDisplayName = entry.resourceId || "N/A"; // Default to full ID

                                        if (parsedId) {
                                            const nameParts = [];
                                            // Try to build a more readable name: Type/Name
                                            if (parsedId.resourceType && parsedId.resourceType.length > 0) {
                                                const typePath = parsedId.resourceType.join('/');
                                                nameParts.push(typePath);
                                            }
                                            if (parsedId.resourceName && parsedId.resourceName.length > 0) {
                                                const resourceNamePath = parsedId.resourceName.join('/');
                                                // If typePath was just added, append to it, else it's the main part
                                                if (nameParts.length > 0 && nameParts[nameParts.length-1].endsWith(parsedId.resourceType[parsedId.resourceType.length -1])) {
                                                   // Avoids [type, type/name] if type is short
                                                   nameParts[nameParts.length-1] = `${nameParts[nameParts.length-1]}/${resourceNamePath}`;
                                                } else {
                                                    nameParts.push(resourceNamePath);
                                                }

                                            }
                                            if (nameParts.length > 0) {
                                                resourceDisplayName = nameParts.join(' / ');
                                            } else if (parsedId.provider && entry.resourceId.toLowerCase().startsWith(`/subscriptions/`)) {
                                                // Fallback for IDs that don't have clear type/name but are specific resources under a provider
                                                resourceDisplayName = entry.resourceId.substring(entry.resourceId.toLowerCase().indexOf(parsedId.provider) + parsedId.provider.length + 1);
                                            }
                                        }
                                        
                                        // Fallback if still the full ID and it's very long
                                        if (resourceDisplayName === entry.resourceId && resourceDisplayName.length > 60) {
                                            resourceDisplayName = "..." + resourceDisplayName.slice(-55);
                                        }


                                        return (
                                            <tr key={`${providerKey}-entry-${index}`} className="resource-sub-row">
                                                <td></td> {/* Empty cell under expand icon, or could add sub-icon */}
                                                <td className="resource-name-cell">
                                                    <span className="indent-prefix">└─</span> {resourceDisplayName}
                                                    {entry.date && <span className="entry-date-suffix"> ({entry.date})</span>}
                                                </td>
                                                <td className="resource-cost-cell">{entry.amount.toFixed(2)}</td>
                                                <td></td> {/* Empty cell under count */}
                                                <td>{entry.currency}</td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="provider-chart-area">
                    <CostBreakdownChart
                        chartTitle={chartTitle}
                        dataToDisplay={providersData} // Chart still uses the aggregated provider data
                    />
                </div>
            </div>
        </div>
    );
}

export default ProviderBreakdownView;