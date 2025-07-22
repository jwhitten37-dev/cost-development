import React from 'react';
import RGL, { WidthProvider } from 'react-grid-layout';
import Widget from './Widget';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ReactGridLayout = WidthProvider(RGL);

const DashboardTab = ({ dashboard, onUpdateWidget, onDeleteWidget }) => {
    const onLayoutChange = (layout) => {
        // Here you would save the layout to your dashboard config
        console.log('Layout changed:', layout);
    };

    return (
        <ReactGridLayout
            className="layout"
            layout={dashboard.widgets.map((w, i) => ({ i: w.id, x: (i * 4) % 12, y: 0, w: 4, h: 2, ...w.layout }))}
            onLayoutChange={onLayoutChange}
            cols={12}
            rowHeight={100}
            // Add this prop to prevent dragging on the button
            draggableCancel=".delete-widget-btn"
        >
            {dashboard.widgets.map(widget => (
                <div key={widget.id} data-grid={{ i: widget.id, x: 0, y: 0, w: 4, h: 2 }}>
                    <Widget
                        widget={widget}
                        onDelete={() => onDeleteWidget(widget.id)}
                        onUpdate={(updated) => onUpdateWidget({ ...widget, ...updated })}
                    />
                </div>
            ))}
        </ReactGridLayout>
    );
};

export default DashboardTab;