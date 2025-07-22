// src/components/CostBreakdownChart.js
import React from 'react';
import { Bar } from 'react-chartjs-2'; // Changed from Doughnut to Bar
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  CategoryScale, // Added for Bar chart
  LinearScale,   // Added for Bar chart
  BarElement     // Added for Bar chart
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  Title,
  CategoryScale,
  LinearScale,
  BarElement
);

const CostBreakdownChart = ({ chartTitle, dataToDisplay, total }) => {
  if (!dataToDisplay || Object.keys(dataToDisplay).length === 0) {
    return <p className="no-chart-data">No data available for chart.</p>;
  }

  const labels = Object.values(dataToDisplay).map(item => item.displayName || item.key); // Use displayName or key
  const costs = Object.values(dataToDisplay).map(item => item.totalCost);

  // Generate a color palette (can be expanded or made more sophisticated)
  const backgroundColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#FFCD56', '#C9CBCF', '#3FC23F', '#F7464A', '#46BFBD', '#FDB45C',
  ];
  const hoverBackgroundColors = [...backgroundColors]; // Use same for hover or define different

  const chartData = {
    labels: labels,
    datasets: [
      {
        label: 'Cost',
        data: costs,
        backgroundColor: backgroundColors.slice(0, labels.length),
        hoverBackgroundColor: hoverBackgroundColors.slice(0, labels.length),
        borderColor: '#fff',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // Important for sizing in a container
    plugins: {
      legend: {
        display: false // This will hide the legend
      },
      title: {
        display: true,
        text: chartTitle || 'Cost Breakdown',
        font: {
          size: 16
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let tooltipText = '';
            if (context.parsed.y !== null) { // For vertical bar chart, use context.parsed.y
              const value = context.parsed.y;
              const currency = Object.values(dataToDisplay)[context.dataIndex]?.currency || ''; // Get currency
              // Calculate percentage of the sum of displayed items
              const sumOfDisplayed = costs.reduce((a, b) => a + b, 0);
              const percentage = sumOfDisplayed > 0 ? ((value / sumOfDisplayed) * 100).toFixed(1) : "0.0";
              tooltipText = `$${value.toFixed(2)} ${currency} (${percentage}%)`;
            }
            return tooltipText;
          }
        }
      },
      // scales: { // Optional: Add if you need to customize axes for Bar chart
      //   y: {
      //     beginAtZero: true
      //   }
      // }
    },
    // cutout: '50%', // This is specific to Doughnut/Pie charts, remove for Bar
  };

  return (
    <div className="chart-container">
      {/* Changed from Doughnut to Bar */}
      <Bar data={chartData} options={chartOptions} />
    </div>
  );
};

export default CostBreakdownChart;