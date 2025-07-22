import React, { useState, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import Widget from './Widget';
import AddWidgetPanel from './AddWidgetPanel';
import './dashboard.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const getFromLS = (key) => {
    let ls = {};
    if (global.localStorage) {
        try {
            ls = JSON.parse(global.localStorage.getItem('dashboard-app')) || {};
        } catch (e) {
            console.error(e);
        }
    
    }
    return ls[key];
};

const saveToLS = (key, value) => {
    if (global.localStorage) {
        try {
            const existingData = JSON.parse(global.localStorage.getItem('dashboard-app')) || {};
            const newData = { ...existingData, [key]: value };
            global.localStorage.setItem('dashboard-app', JSON.stringify(newData));
        } catch (e) {
        /* Ignore */
        }
    }
};

const DashboardPage = () => {
    const [widgets, setWidgets] = useState(() => {
        return getFromLS('widgets') || [];
    });

    const [layouts, setLayouts] = useState(() => {
        return getFromLS('layouts') || [];
    });

    useEffect(() => {
        saveToLS('widgets', widgets);
        saveToLS('layouts', layouts);
    }, [widgets, layouts]);

    const onLayoutChange = (_, allLayouts) => {
        setLayouts(allLayouts);
    };

    const addWidget = (widgetType) => {
        const newWidget = {
            i: `widgets-${widgets.length}-${Date.now()}`,
            x: (widgets.length % 4) % 12,
            y: Infinity, // puts it at the bottom
            w: 4,
            h: 2,
            type: widgetType,
        };
        setWidgets([...widgets, newWidget]);
    };

    const removeWidget = (widgetId) => {
        setWidgets(widgets.filter((w) => w.i !== widgetId));
    };

    return (
        <div className="dashboard-container">
            <AddWidgetPanel onAddWidget={addWidget} />
            <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={100}
                onLayoutChange={onLayoutChange}
            >
                {widgets.map((widget) => (
                    <div key={widget.i} data-grid={widget}>
                        <Widget
                            id={widget.i}
                            type={widget.type}
                            onRemoveWidget={removeWidget}
                        />
                    </div>
                ))}
            </ResponsiveGridLayout>
        </div>
    );
};

export default DashboardPage;