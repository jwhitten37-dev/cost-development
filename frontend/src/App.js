import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import DashboardPage from './components/Dashboard/DashboardPage';
import ComparisonPage from './components/Comparison/ComparisonPage';
import ResourceViewPage from './components/ResourceView/ResourceViewPage';
import './App.css';
// Define light and dark themes
const lightTheme = createTheme({
    palette: {
        mode: 'light',
    },
});

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
    },
});

function App() {
    const [themeMode, setThemeMode] = useState('light');
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const toggleTheme = () => {
        setThemeMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
    };

    const toggleSidebar = () => {
        setSidebarOpen(!isSidebarOpen);
    };

    const activeTheme = themeMode === 'light' ? lightTheme : darkTheme;

    useEffect(() => {
        document.body.className = `${themeMode}-theme`;
    }, [themeMode]);

    return (
        <ThemeProvider theme={activeTheme}>
            <CssBaseline />
            <Router>
                <div className="app-container">
                    <Sidebar
                        isSidebarOpen={isSidebarOpen}
                        toggleSidebar={toggleSidebar}
                        themeMode={themeMode}
                        toggleTheme={toggleTheme}
                    />
                    <main className="main-content">
                        <Header />
                        <div className="page-content">
                            <Routes>
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/comparison" element={<ComparisonPage />} />
                                <Route path="/resource-view" element={<ResourceViewPage />} />
                            </Routes>
                        </div>
                        <Footer />
                    </main>
                </div>
            </Router>
        </ThemeProvider>
    );
}

export default App;