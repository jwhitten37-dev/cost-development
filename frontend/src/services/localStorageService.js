export const getDashboardConfig = () => {
    try {
        const serializedState = localStorage.getItem('dashboardConfig');
        if (serializedState === null) {
            return undefined;
        }
        return JSON.parse(serializedState);
    } catch (error) {
        console.error("Error loading state from localStorage", error);
        return undefined;
    }
};

export const saveDashboardConfig = (state) => {
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem('dashboardConfig', serializedState);
    } catch (error) {
        console.error("Error saving state to localStorage", error);
    }
};