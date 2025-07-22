import React, { useEffect, useState } from 'react';
import { getCostData } from '../../services/azureApiService';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Tooltip, Legend, XAxis, YAxis, CartesianGrid } from 'recharts';

const ChartWidget = ({ subscriptionId, chartType, title }) => {
    const [data, setData] = useState([]);

    useEffect(() => {
        getCostData(subscriptionId, chartType).then(setData);
    }, [subscriptionId, chartType]);

    const renderChart = () => {
        switch (chartType) {
            case 'line':
                return (
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="cost" stroke="#8884d8" />
                    </LineChart>
                );
            case 'bar':
                return (
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="cost" fill="#82ca9d" />
                    </BarChart>
                );
            case 'doughnut':
                return (
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} fill="#8884d8" />
                        <Tooltip />
                    </PieChart>
                );
            default:
                return <div>Select a chart type</div>;
        }
    };

    return (
        <div className="chart-widget">
            <h4>{title}</h4>
            {renderChart()}
        </div>
    );
};

export default ChartWidget;