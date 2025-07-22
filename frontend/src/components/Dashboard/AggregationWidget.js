import React, { useEffect, useState } from 'react';

// Mock function to simulate fetching aggregated data across all subscriptions
const getAggregatedCostData = async () => {
    console.log('Fetching aggregated cost data for all subscriptions');
    // In a real app, this would iterate through accessible subscriptions and sum the costs.
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                totalCost: 55000,
                subscriptionCount: 4,
            });
        }, 1200);
    });
};

const AggregationWidget = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const result = await getAggregatedCostData();
            setData(result);
            setLoading(false);
        };
        fetchData();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!data) {
        return <div>No data available.</div>;
    }

    return (
        <div className="aggregation-widget">
            <h4>Aggregated Cost Across All Subscriptions</h4>
            <h2>${data.totalCost.toLocaleString()}</h2>
            <p>From {data.subscriptionCount} subscriptions.</p>
        </div>
    );
};

export default AggregationWidget;