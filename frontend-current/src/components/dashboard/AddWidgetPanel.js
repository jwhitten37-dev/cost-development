import React from 'react';

const AddWidgetPanel = ({ onAddWidget }) => {
    return (
        <div className="add-widget-panel">
            <h3>Add Widgets</h3>
            <button onClick={() => onAddWidget('subscription-cost')} className="add-widget-button">
                Add Subscription Cost
            </button>
            {/* Add other widget types here */}
        </div>
    );
};

export default AddWidgetPanel;