// Mock function to simulate fetching data
export const getCostData = async (subscriptionId, chartType) => {
    console.log(`Fetching ${chartType} data for subscription: ${subscriptionId}`);
    // In a real application, you would make an API call here.
    return new Promise(resolve => {
        setTimeout(() => {
            const data = {
                'line': [
                    { name: 'Jan', cost: 4000 },
                    { name: 'Feb', cost: 3000 },
                    { name: 'Mar', cost: 5000 },
                ],
                'bar': [
                    { name: 'Resource A', cost: 2000 },
                    { name: 'Resource B', cost: 1500 },
                    { name: 'Resource C', cost: 3500 },
                ],
                'doughnut': [
                    { name: 'Service 1', value: 400 },
                    { name: 'Service 2', value: 300 },
                    { name: 'Service 3', value: 300 },
                ],
            };
            resolve(data[chartType] || []);
        }, 1000);
    });
};