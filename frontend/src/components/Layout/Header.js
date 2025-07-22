import React from 'react';
import './Header.css';

const Header = () => {
    return (
        <header className="App-header">
            {/* Site Logo Placeholder can go here if needed */}
            {/* <img src="/path-to-your-logo.png" alt="Site Logo" className="site-logo-placeholder" /> */}
            <h1>Cloud Overall Spending Tracker (COST)</h1>
            <div className="header-auth-section">
                <>
                    <span className="user-greeting">Welcome, Test User</span>
                    <button className="auth-button logout-button">Logout</button>
                    {/* User Avatar Placeholder */}
                    {/* <img src="/path-to-avatar.png" alt="User Avatar" className="user-avatar-placeholder" /> */}
                </>
            </div>
        </header>
    );
};

export default Header;