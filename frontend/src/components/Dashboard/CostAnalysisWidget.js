import React, { useEffect, useState } from 'react';

// Mock function to simulate fetching cost analysis data
const getCostAnalysisData = async (subscriptionId) => {
    console.log(`Fetching cost analysis data for subscription: ${subscriptionId}`);
    // In a real application, you would make an API call here.
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                actualVsForecasted: { actual: 8500, forecasted: 9500 },
                resourceCount: 128,
                topResources: [
                    { name: 'Virtual Machine 1', cost: 1200 },
                    { name: 'Storage Account A', cost: 950 },
                    { name: 'SQL Database X', cost: 800 },
                    { name: 'App Service Plan', cost: 650 },
                    { name: 'Virtual Network', cost: 400 },
                ],
            });
        }, 1000);
    });
};


const CostAnalysisWidget = ({ subscriptionId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const result = await getCostAnalysisData(subscriptionId);
            setData(result);
            setLoading(false);
        };
        fetchData();
    }, [subscriptionId]);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!data) {
        return <div>No data available.</div>;
    }

    return (
        <div className="cost-analysis-widget">
            <div className="cost-metric">
                <h4>Actual vs. Forecasted Cost</h4>
                <p>Actual: ${data.actualVsForecasted.actual.toLocaleString()}</p>
                <p>Forecasted: ${data.actualVsForecasted.forecasted.toLocaleString()}</p>
            </div>
            <div className="cost-metric">
                <h4>Resource Count</h4>
                <p>{data.resourceCount} Resources</p>
            </div>
            <div className="cost-metric">
                <h4>Top 5 Resources by Cost</h4>
                <ul>
                    {data.topResources.map(resource => (
                        <li key={resource.name}>
                            {resource.name}: <strong>${resource.cost.toLocaleString()}</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default CostAnalysisWidget;