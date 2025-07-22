// src/components/SubscriptionSelector.js
import React from 'react';
import './SubscriptionSelector.css';

function SubscriptionSelector({
    onSubscriptionSelect,
    currentSelectedId,
    isLoading, // This is now App.js's main loading OR fetchingSubscriptions state
    items, // This prop receives the filtered list from App.js
    isAuthenticated // Still used for disabling if not authenticated
}) {
    const displayItems = items || []; // Ensure items is always an array

    const handleChange = (event) => {
        onSubscriptionSelect(event.target.value); // Notify parent (App.js)
    };

    // Determine if the selector should be disabled
    const isDisabled = !isAuthenticated || isLoading || (isAuthenticated && displayItems.length === 0 && !isLoading);
    // The (isAuthenticated && displayItems.length === 0 && !isLoading) part means:
    // if authenticated, and list is empty, and app is not generally loading, then it's disabled (e.g. no subs found)

    return (
        <div className="subscription-selector-container">
            <label htmlFor="subscription-select">Select Subscription:</label>
            <select
                id="subscription-select"
                value={currentSelectedId || ''} // Controlled by App.js's selectedSubscription state
                onChange={handleChange}
                disabled={isDisabled}
                aria-label="Select Azure Subscription from discovered list"
            >
                <option value="">-- Select from discovered --</option>
                {displayItems.map(sub => (
                    <option key={sub.subscription_id} value={sub.subscription_id}>
                        {sub.display_name} ({sub.subscription_id.slice(0,8)}...)
                    </option>
                ))}
            </select>
            {/* 
              The "Loading list..." message specific to subscription list fetching 
              is now implicitly handled by App.js's `fetchingSubscriptions` state being part of `isLoading` prop.
            */}
            {isAuthenticated && displayItems.length === 0 && !isLoading && (
                <p className="no-subs-message">No subscriptions matching 'AI2C' discovered or accessible.</p>
            )}
            {!isAuthenticated && (
                <p className="no-subs-message">Please log in to load subscriptions.</p>
            )}
        </div>
    );
}

export default SubscriptionSelector;