import React from 'react';
import ChartWidget from './ChartWidget';
import CostAnalysisWidget from './CostAnalysisWidget';
import AggregationWidget from './AggregationWidget';
import './Widget.css';

const Widget = ({ widget, onDelete, onUpdate }) => {
    const renderWidget = () => {
        switch (widget.type) {
            case 'chart':
                return <ChartWidget {...widget} />;
            case 'cost-analysis':
                return <CostAnalysisWidget {...widget} />;
            case 'aggregation':
                return <AggregationWidget {...widget} />;
            default:
                return <div>Unknown widget type</div>;
        }
    };

    return (
        <div className="widget">
            <div className="widget-header">
                <h3>{widget.title}</h3>
                {/* Add className here */}
                <button onClick={onDelete} className="delete-widget-btn">X</button>
            </div>
            <div className="widget-content">
                {renderWidget()}
            </div>
        </div>
    );
};

export default Widget;