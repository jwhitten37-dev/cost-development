from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date
from typing import List, Optional, Dict, Any

class CostQueryRequest(BaseModel):
    timeframe: str = Field(..., description="e.g., MonthToDate, TheLast7Days, Custom")
    from_date: Optional[date] = Field(None, description="Required if timeframe is 'Custom' (YYYY-MM-DD)")
    to_date: Optional[date] = Field(None, description="Required if timeframe is 'Custom' (YYYY-MM-DD)")
    granularity: str = Field("None", description="e.g., Daily, Monthly, None (for total)")

class CostEntry(BaseModel):
    date: Optional[str] = None
    amount: float
    currency: str
    resource_group_name: Optional[str] = Field(None, alias="resourceGroupName")
    resource_id: Optional[str] = Field(None, alias="resourceId")
    entry_type: str = "actual" # Can be 'actual' or 'forecast'

    class Config:
        populate_by_name: True

class MonthlyBreakdownItem(BaseModel):
    month: str
    year: int
    actual: Optional[float] = None
    forecast: Optional[float] = None

class SubscriptionCostDetails(BaseModel):
    subscription_id: str
    subscription_name: Optional[str] = None
    total_cost: float
    currency: str
    costs_by_resource_group: Dict[str, float] = {}
    timeframe_used: str
    from_date_used: Optional[str] = None
    to_date_used: Optional[str] = None
    granularity_used: str
    projected_cost_current_month: Optional[float] = None # End of Current Month
    yearly_monthly_breakdown: List[MonthlyBreakdownItem] = []
    yearly_daily_breakdown: List[CostEntry] = []
    projected_cost_dynamic: Optional[float] = None      # Projection based on selected timeframe
    projected_cost_dynamic_label: Optional[str] = None  # Label for the dynamic projection
    projected_costs_by_resource_group_dynamic: Dict[str, float] = {} # RG projections for dynamic timeframe
    detailed_entries: List[CostEntry] = []

class ResourceGroupCostDetails(BaseModel):
    subscription_id: str
    resource_group_name: str
    total_cost: float
    currency: str
    timeframe_used: str
    from_date_used: Optional[str] = None
    to_date_used: Optional[str] = None
    granularity_used: str
    detailed_entries: List[CostEntry] = []

class AzureSubscription(BaseModel):
    id: str
    subscription_id: str
    display_name: str
    state: Optional[str] = None

class ReportCreationResponse(BaseModel):
    message: str
    file_name: Optional[str] = None
    download_url: Optional[str] = None

class TagValueDetails(BaseModel):
    tagValue: Optional[str] = None
    # count: Optional[Dict[str, Any]] = None # If you need count details

class TagDetailsResponse(BaseModel):
    tagName: str
    values: List[Optional[str]] # List of distinct string values for the tag