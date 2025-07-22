import React from 'react';
import SubscriptionCostWidget from './SubscriptionCostWidget';

const Widget = ({ id, type, onRemoveWidget }) => {
    const renderWidgetContent = () => {
        switch (type) {
            case 'subscription-cost':
                return <SubscriptionCostWidget />;
            // Add other widget types here
            // case 'resource-cost':
            //   return <ResourceCostWidget />;
            default:
                return <div>Unknown widget type</div>;
        }
    };

    return (
        <div className="widget">
            <div className="widget-header">
                <span className="widget-title">{type.replace('-', ' ')}</span>
                <button onClick={() => onRemoveWidget(id)} className="remove-widget-button">
                    &times;
                </button>
            </div>
            <div className="widget-content">{renderWidgetContent()}</div>
        </div>
    );
};

export default Widget;