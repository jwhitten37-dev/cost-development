import React from 'react';
import { NavLink } from 'react-router-dom';
import { List, ListItem, ListItemIcon, ListItemText, Divider, Switch, IconButton } from '@mui/material';
import { Dashboard, CompareArrows, BarChart, Settings, Brightness4, Brightness7, ChevronLeft, ChevronRight } from '@mui/icons-material';
import './Sidebar.css';

const Sidebar = ({ isSidebarOpen, toggleSidebar, themeMode, toggleTheme }) => {
    return (
        <div className={isSidebarOpen ? "sidebar open" : "sidebar"}>
            <div className="sidebar-header">
                {isSidebarOpen && <h3>Azure Portal</h3>}
                <IconButton onClick={toggleSidebar}>
                    {isSidebarOpen ? <ChevronLeft /> : <ChevronRight />}
                </IconButton>
            </div>
            <Divider />
            <div className="sidebar-content">
                <List className="sidebar-top-menu">
                    <ListItem button component={NavLink} to="/">
                        <ListItemIcon><Dashboard /></ListItemIcon>
                        {isSidebarOpen && <ListItemText primary="Dashboard" />}
                    </ListItem>
                    <ListItem button component={NavLink} to="/comparison">
                        <ListItemIcon><CompareArrows /></ListItemIcon>
                        {isSidebarOpen && <ListItemText primary="Comparison" />}
                    </ListItem>
                    <ListItem button component={NavLink} to="/resource-view">
                        <ListItemIcon><BarChart /></ListItemIcon>
                        {isSidebarOpen && <ListItemText primary="Resource View" />}
                    </ListItem>
                </List>
                <div className="sidebar-bottom-menu">
                    <Divider />
                    <ListItem>
                        <ListItemIcon>
                            {themeMode === 'light' ? <Brightness4 /> : <Brightness7 />}
                        </ListItemIcon>
                        {isSidebarOpen && <ListItemText primary="Theme" />}
                        <Switch
                            checked={themeMode === 'dark'}
                            onChange={toggleTheme}
                            name="themeSwitcher"
                        />
                    </ListItem>
                    <ListItem button>
                        <ListItemIcon><Settings /></ListItemIcon>
                        {isSidebarOpen && <ListItemText primary="Settings" />}
                    </ListItem>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;