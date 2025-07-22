import React, { useState, useEffect } from 'react';
import { getDashboardConfig, saveDashboardConfig } from '../../services/localStorageService';
import DashboardTab from './DashboardTab';
import AddWidgetModal from '../UI/AddWidgetModal';
import { Button, Tabs, Tab, TextField, IconButton } from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import './DashboardPage.css';

const DashboardPage = () => {
    const [dashboards, setDashboards] = useState([]);
    const [activeTab, setActiveTab] = useState(0);
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingTab, setEditingTab] = useState(null);

    useEffect(() => {
        const savedDashboards = getDashboardConfig();
        if (savedDashboards) {
            setDashboards(savedDashboards);
        }
    }, []);

    useEffect(() => {
        saveDashboardConfig(dashboards);
    }, [dashboards]);

    const handleAddDashboard = () => {
        const newDashboard = {
            id: Date.now(),
            name: `Dashboard ${dashboards.length + 1}`,
            widgets: [],
        };
        setDashboards([...dashboards, newDashboard]);
        setActiveTab(dashboards.length);
    };

    const handleAddWidget = (widget) => {
        const newDashboards = [...dashboards];
        newDashboards[activeTab].widgets.push({
            ...widget,
            id: `widget-${Date.now()}`,
        });
        setDashboards(newDashboards);
    };

    const handleUpdateWidget = (updatedWidget) => {
        const newDashboards = [...dashboards];
        const widgetIndex = newDashboards[activeTab].widgets.findIndex(w => w.id === updatedWidget.id);
        newDashboards[activeTab].widgets[widgetIndex] = updatedWidget;
        setDashboards(newDashboards);
    };

    const handleDeleteWidget = (widgetId) => {
        const newDashboards = [...dashboards];
        newDashboards[activeTab].widgets = newDashboards[activeTab].widgets.filter(w => w.id !== widgetId);
        setDashboards(newDashboards);
    };

    const handleRenameDashboard = (newName) => {
        const newDashboards = [...dashboards];
        newDashboards[editingTab].name = newName;
        setDashboards(newDashboards);
        setEditingTab(null);
    };

    return (
        <div className="dashboard-page">
            <div className="dashboard-controls">
                <Button variant="contained" color="primary" startIcon={<Add />} onClick={handleAddDashboard}>
                    New Dashboard
                </Button>
                <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => setModalOpen(true)} disabled={dashboards.length === 0}>
                    Add Widget
                </Button>
            </div>
            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} indicatorColor="primary">
                {dashboards.map((dashboard, index) => (
                    <Tab
                        key={dashboard.id}
                        label={
                            editingTab === index ? (
                                <TextField
                                    defaultValue={dashboard.name}
                                    onBlur={(e) => handleRenameDashboard(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleRenameDashboard(e.target.value)}
                                    autoFocus
                                />
                            ) : (
                                <span>{dashboard.name}</span>
                            )
                        }
                        icon={
                            <div>
                                <IconButton size="small" onClick={() => setEditingTab(index)}><Edit /></IconButton>
                                <IconButton size="small" onClick={() => setDashboards(dashboards.filter(d => d.id !== dashboard.id))}><Delete /></IconButton>
                            </div>
                        }
                    />
                ))}
            </Tabs>

            {dashboards.map((dashboard, index) => (
                <div key={dashboard.id} style={{ display: index === activeTab ? 'block' : 'none' }}>
                    <DashboardTab
                        dashboard={dashboard}
                        onUpdateWidget={handleUpdateWidget}
                        onDeleteWidget={handleDeleteWidget}
                    />
                </div>
            ))}

            <AddWidgetModal
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
                onAddWidget={handleAddWidget}
            />
        </div>
    );
};

export default DashboardPage;