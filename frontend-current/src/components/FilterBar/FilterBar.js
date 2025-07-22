import React, { useState, useEffect } from 'react';
import { Box, Button, Chip, FormControl, InputLabel, Select, MenuItem, TextField, Popover, Typography, Snackbar } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'; // Import Snackbar
import FilterListIcon from '@mui/icons-material/FilterList';
import './FilterBar.css'; // Import the new CSS file
import { fetchAvailableTags } from '../../services/api';

const FilterToken = ({ filter, onRemove }) => {
  let label = '';
  if (filter.type === 'tag') {
    label = `Tag: ${filter.key} ${filter.operator} "${filter.value}"`;
  } else if (filter.type === 'timeframe') {
    label = `Timeframe: ${filter.value}`;
    if (filter.value === 'Custom' && filter.fromDate && filter.toDate) {
      label += ` (${new Date(filter.fromDate).toLocaleDateString()} - ${new Date(filter.toDate).toLocaleDateString()})`;
    }
  } else if (filter.type === 'granularity') {
    label = `Granularity: ${filter.value}`;
  }

  return (
    <Chip
      label={label}
      onDelete={() => onRemove(filter.id)}
      sx={{ marginRight: 1, marginBottom: 1 }}
      size="small"
    />
  );
};

const AddFilterForm = ({ onAddFilter, onClose, initialTimeframe, initialGranularity, initialFromDate, initialToDate, availableTags, loadingTags }) => {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [filterType, setFilterType] = useState('tag');
  const [tagKey, setTagKey] = useState('');
  const [tagOperator, setTagOperator] = useState('=');
  const [tagValue, setTagValue] = useState('');
  const [selectedTagKeyObject, setSelectedTagKeyObject] = useState(null);
  const [timeframeValue, setTimeframeValue] = useState(initialTimeframe || 'MonthToDate');
  const [granularityValue, setGranularityValue] = useState(initialGranularity || 'None');
  const [customFrom, setCustomFrom] = useState(initialFromDate ? new Date(initialFromDate).toISOString().split('T')[0] : '');
  const [customTo, setCustomTo] = useState(initialToDate ? new Date(initialToDate).toISOString().split('T')[0] : '');

  useEffect(() => {
    if (filterType === 'timeframe') {
        setTimeframeValue(initialTimeframe || 'MonthToDate');
        setCustomFrom(initialFromDate ? new Date(initialFromDate).toISOString().split('T')[0] : '');
        setCustomTo(initialToDate ? new Date(initialToDate).toISOString().split('T')[0] : '');
    } else if (filterType === 'granularity') {
        setGranularityValue(initialGranularity || 'None');
    } else if (filterType === 'tag') {
        setTagKey(''); // Reset tag key when switching to tag filter type
        setSelectedTagKeyObject(null);
        setTagValue('');
    }
  }, [filterType, initialTimeframe, initialGranularity, initialFromDate, initialToDate]);

  const handleSubmit = () => {
    let newFilter = {};
    if (filterType === 'tag') {
      const actualTagKey = selectedTagKeyObject ? selectedTagKeyObject.tagName : tagKey;
      if (!actualTagKey || !tagValue) {
        setSnackbarMessage('Tag key and value are required.');
        setSnackbarOpen(true);
        return;
      }
      newFilter = { type: 'tag', key: actualTagKey, operator: tagOperator, value: tagValue };
    } else if (filterType === 'timeframe') {
      newFilter = { type: 'timeframe', value: timeframeValue };
      if (timeframeValue === 'Custom') {
        if (!customFrom || !customTo) {
          setSnackbarMessage('Custom date range requires From and To dates.');
          setSnackbarOpen(true);
          return;
        }
        newFilter.fromDate = new Date(customFrom).toISOString();
        newFilter.toDate = new Date(customTo).toISOString();
      } else {
        newFilter.fromDate = null;
        newFilter.toDate = null;
      }
    } else if (filterType === 'granularity') {
      newFilter = { type: 'granularity', value: granularityValue };
    }
    onAddFilter(newFilter);
    onClose();
  };

  return (
    <Box sx={{ p: 2, width: 350, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6">Add Filter</Typography>
      <FormControl fullWidth size="small">
        <InputLabel>Filter Type</InputLabel>
        <Select value={filterType} label="Filter Type" onChange={(e) => setFilterType(e.target.value)}>
          <MenuItem value="tag">Tag</MenuItem>
          <MenuItem value="timeframe">Timeframe</MenuItem>
          <MenuItem value="granularity">Granularity</MenuItem>
        </Select>
      </FormControl>

      {filterType === 'tag' && (
        <>
          <FormControl fullWidth size="small">
            <InputLabel>Tag Key</InputLabel>
            <Select
              value={selectedTagKeyObject ? selectedTagKeyObject.tagName : ""}
              label="Tag Key"
              onChange={(e) => {
                const selected = availableTags.find(t => t.tagName === e.target.value);
                setSelectedTagKeyObject(selected);
                setTagKey(e.target.value); // Keep this for direct input fallback if needed
                setTagValue(''); // Reset tag value when key changes
              }}
            >
              {loadingTags && <MenuItem disabled><em>Loading tags...</em></MenuItem>}
              {!loadingTags && availableTags.length === 0 && <MenuItem disabled><em>No tags found or loaded.</em></MenuItem>}
              {!loadingTags && availableTags.map(tag => (
                  <MenuItem key={tag.tagName} value={tag.tagName}>{tag.tagName}</MenuItem>
              ))}
              {/* Allow manual input if needed, or remove if only dropdown selection is desired */}
              {/* {!loadingTags && <MenuItem value=""><em>(Enter manually)</em></MenuItem>} */}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Operator</InputLabel>
            <Select value={tagOperator} label="Operator" onChange={(e) => setTagOperator(e.target.value)}>
              <MenuItem value="=">=</MenuItem>
              <MenuItem value="!=">!=</MenuItem>
              {/* Add other operators if backend supports them, e.g., Contains, DoesNotContain */}
            </Select>
          </FormControl>
          {selectedTagKeyObject && selectedTagKeyObject.values && selectedTagKeyObject.values.length > 0 ? (
            <FormControl fullWidth size="small">
              <InputLabel>Tag Value</InputLabel>
              <Select
                value={tagValue}
                label="Tag Value"
                onChange={(e) => setTagValue(e.target.value)}
              >
                {selectedTagKeyObject.values.map(val => (
                  <MenuItem key={val} value={val}>{val}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField label="Tag Value" value={tagValue} onChange={(e) => setTagValue(e.target.value)} fullWidth size="small" />
          )}
        </>
      )}
      {filterType === 'timeframe' && (
        <>
          <FormControl fullWidth size="small">
            <InputLabel>Timeframe</InputLabel>
            <Select value={timeframeValue} label="Timeframe" onChange={(e) => setTimeframeValue(e.target.value)}>
              {['MonthToDate', 'QuarterToDate', 'YearToDate', 'TheLastMonth', 'TheLastQuarter', 'TheLastYear', 'Custom'].map(tf => <MenuItem key={tf} value={tf}>{tf}</MenuItem>)}
            </Select>
          </FormControl>
          {timeframeValue === 'Custom' && (
            <>
              <TextField label="From Date" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth size="small" />
              <TextField label="To Date" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth size="small" />
            </>
          )}
        </>
      )}
      {filterType === 'granularity' && (
        <FormControl fullWidth size="small">
          <InputLabel>Granularity</InputLabel>
          <Select value={granularityValue} label="Granularity" onChange={(e) => setGranularityValue(e.target.value)}>
            {['None', 'Daily'].map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </Select>
        </FormControl>
      )}
      <Button variant="contained" onClick={handleSubmit} startIcon={<AddCircleOutlineIcon />}>Apply Filter</Button>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Box>
  );
};

const DEV_SUBSCRIPTION_ID_FOR_TAGS = 'd9f0aeb8-aa43-4c0c-9bc9-31502788ee65'; // AFC-AI2C-CARAVAN-D

const FilterBar = ({ activeFilters, onAddFilter, onRemoveFilter, currentSubscriptionId }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagsFetched, setTagsFetched] = useState(false);
  const handleClickAdd = (event) => setAnchorEl(event.currentTarget);
  const handleCloseAdd = () => setAnchorEl(null);
  const open = Boolean(anchorEl);

  useEffect(() => {
    // Fetch available tags when the filter popover is opened and a subscription context exists
    // Or, fetch them once when the FilterBar mounts if it's always for a single subscription context.
    // For now, let's fetch if currentSubscriptionId is present, assuming it's for the detail view.
    // For overview, tag discovery might be more complex (union of tags from all subs or disabled).
    // console.log("FilterBar useEffect: open:", { open, loadingTags, tagsFetched });
    if (open && !loadingTags && !tagsFetched) {
        console.log("FilterBar: Attempting to fetch available tags from DEV sub:", DEV_SUBSCRIPTION_ID_FOR_TAGS);
        setLoadingTags(true);
        // Always fetch from the DEV_SUBSCRIPTION_ID_FOR_TAGS
        fetchAvailableTags(DEV_SUBSCRIPTION_ID_FOR_TAGS)
            .then(tags => {
                console.log("FilterBar: Fetched tags:", tags);
                setAvailableTags(tags || []);
            })
            .catch(err => console.error("FilterBar: Failed to load available tags", err))
            .finally(() => {
                setTagsFetched(true);
                setLoadingTags(false)
            });
    }
  }, [open, loadingTags, tagsFetched]);
  // console.log("FilterBar: Current availableTags state:", availableTags);

  const currentTimeframeFilter = activeFilters.find(f => f.type === 'timeframe') || {};
  const currentGranularityFilter = activeFilters.find(f => f.type === 'granularity') || {};

  return (
    <Box className="filter-bar-container">
      <Box className="filter-bar-inner-container">
        <FilterListIcon sx={{ marginRight: 1, color: 'action.active', alignSelf: 'flex-start', mt: 0.5 }} />
        {activeFilters.map((filter) => <FilterToken key={filter.id} filter={filter} onRemove={onRemoveFilter} />)}
        <Button variant="outlined" onClick={handleClickAdd} startIcon={<AddCircleOutlineIcon />} size="small" sx={{ ml: activeFilters.length > 0 ? 1 : 0, mb: activeFilters.length > 0 ? 0 : 1 }}>
          Add Filter
        </Button>
        <Popover open={open} anchorEl={anchorEl} onClose={handleCloseAdd} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
          <AddFilterForm 
            onAddFilter={onAddFilter} onClose={handleCloseAdd}
            availableTags={availableTags}
            loadingTags={loadingTags}
            initialTimeframe={currentTimeframeFilter.value}
            initialGranularity={currentGranularityFilter.value}
            initialFromDate={currentTimeframeFilter.fromDate}
            initialToDate={currentTimeframeFilter.toDate}
          />
        </Popover>
      </Box>
    </Box>
  );
};

export default FilterBar;