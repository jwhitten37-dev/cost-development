import React, { useState } from 'react';
import { Modal, TextField, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import './AddWidgetModal.css';

const AddWidgetModal = ({ isOpen, onClose, onAddWidget }) => {
    const [title, setTitle] = useState('');
    const [type, setType] = useState('chart');
    const [subscriptionId, setSubscriptionId] = useState('');
    const [chartType, setChartType] = useState('line');

    const handleSubmit = () => {
        // Create the widget object with properties relevant to its type
        const widgetConfig = {
            title,
            type,
            subscriptionId: type !== 'aggregation' ? subscriptionId : null, // Aggregation doesn't need a subscription ID
            chartType: type === 'chart' ? chartType : null,
        };
        onAddWidget(widgetConfig);
        setTitle('');
        setSubscriptionId('');
        onClose();
    };

    return (
        <Modal open={isOpen} onClose={onClose}>
            <div className="modal-content">
                <h2>Add New Widget</h2>
                <TextField label="Widget Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth margin="normal" />
                <FormControl fullWidth margin="normal">
                    <InputLabel>Widget Type</InputLabel>
                    <Select value={type} onChange={(e) => setType(e.target.value)}>
                        <MenuItem value="chart">Chart</MenuItem>
                        <MenuItem value="cost-analysis">Cost Analysis</MenuItem>
                        <MenuItem value="aggregation">Aggregation</MenuItem>
                    </Select>
                </FormControl>

                {/* Only show Subscription ID field if it's not an aggregation widget */}
                {type !== 'aggregation' && (
                    <TextField label="Subscription ID" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} fullWidth margin="normal" />
                )}

                {/* Only show Chart Type field for chart widgets */}
                {type === 'chart' && (
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Chart Type</InputLabel>
                        <Select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                            <MenuItem value="line">Line</MenuItem>
                            <MenuItem value="bar">Bar</MenuItem>
                            <MenuItem value="doughnut">Doughnut</MenuItem>
                        </Select>
                    </FormControl>
                )}
                <Button variant="contained" color="primary" onClick={handleSubmit} style={{ marginTop: '20px' }}>Add Widget</Button>
            </div>
        </Modal>
    );
};

export default AddWidgetModal;