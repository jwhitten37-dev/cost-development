import logging
import os
from datetime import datetime, timedelta, timezone, date as DateObject
from typing import List, Dict, Optional, Tuple, Any
import pandas as pd
import time # For custom credential default expiry

from azure.core.credentials import AccessToken, TokenCredential # For custom credential
from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import (
    QueryDefinition,
    QueryTimePeriod,
    QueryDataset,
    QueryAggregation,
    QueryGrouping,
    ExportType, TimeframeType, QueryFilter, # Added QueryFilter
    QueryComparisonExpression, # Added QueryComparisonExpression
    ForecastDefinition  # Import ForecastDefinition
)
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.resource.resources import ResourceManagementClient # New import for tags
from azure.core.exceptions import HttpResponseError, ClientAuthenticationError
from app.core.config import settings
from app.models.cost import AzureSubscription # Pydantic model
from fastapi import HTTPException

logger = logging.getLogger(__name__)
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

endpoint = settings.AZURE_RESOURCE_MANAGER_ENDPOINT
audience = settings.AZURE_RESOURCE_MANAGER_AUDIENCE
logger.debug(f'{endpoint} - {audience}')

# Custom Credential Class to wrap a pre-existing bearer token
class CustomBearerTokenCredential(TokenCredential):
    def __init__(self, token_string: str, expires_on_timestamp: Optional[int] = None):
        """
        A custom credential that uses a pre-existing bearer token.

        :param token_string: The bearer token string.
        :param expires_on_timestamp: The Unix timestamp when the token expires.
                                     If None, a default short expiry (1 hour) will be used.
                                     It's recommended to pass the actual expiry if known.
        """
        if not token_string:
            raise ValueError("Token string cannot be empty for CustomBearerTokenCredential.")
        self._token_string = token_string

        if expires_on_timestamp is None:
            self._expires_on = int(time.time()) + 3600 # Default to 1 hour from now
            logger.debug("expires_on_timestamp not provided for CustomBearerTokenCredential, defaulting to 1 hour.")
        else:
            self._expires_on = expires_on_timestamp

    def get_token(self, *scopes: str, **kwargs: Any) -> AccessToken:
        """
        Returns the pre-existing token.
        The scopes argument is part of the TokenCredential interface but is not
        used here as the token is already acquired.
        """
        # Basic check, though the service ultimately validates the token.
        if self._expires_on <= int(time.time()):
            logger.warning("The provided token for CustomBearerTokenCredential may be expired based on its 'expires_on' timestamp.")
            # Depending on strictness, you could raise ClientAuthenticationError here.
            # raise ClientAuthenticationError(message="The wrapped token is expired.")
        return AccessToken(self._token_string, self._expires_on)

def get_cost_management_client(user_access_token: str, user_token_expires_on: Optional[int] = None) -> CostManagementClient:
    """Initializes CostManagementClient with a user-provided Bearer token via custom credential."""
    if not audience:
        raise ValueError("AZURE_RESOURCE_MANAGER_AUDIENCE must be configured.")
    credential = CustomBearerTokenCredential(user_access_token, user_token_expires_on)
    return CostManagementClient(credential=credential, base_url=endpoint, credential_scopes=[f"{audience}/.default"])

def get_subscription_client(user_access_token: str, user_token_expires_on: Optional[int] = None) -> SubscriptionClient:
    """Initializes SubscriptionClient with a user-provided Bearer token via custom credential."""
    credential = CustomBearerTokenCredential(user_access_token, user_token_expires_on)
    return SubscriptionClient(credential=credential, base_url=endpoint, credential_scopes=[f"{audience}/.default"])
def get_resource_management_client(user_access_token: str, user_token_expires_on: Optional[int] = None) -> ResourceManagementClient:
    """Initializes ResourceManagementClient with a user-provided Bearer token."""
    credential = CustomBearerTokenCredential(user_access_token, user_token_expires_on)
    # Note: ResourceManagementClient typically doesn't need credential_scopes specified at client level for general ARM operations
    return ResourceManagementClient(credential=credential, subscription_id="dummy-will-be-overridden-by-operation", base_url=endpoint)
    

# --- File Storage ---
GENERATED_REPORTS_DIR = "generated_reports"
os.makedirs(GENERATED_REPORTS_DIR, exist_ok=True)

# --- Helper Functions ---
def _determine_time_period(timeframe: str, from_date: Optional[DateObject] = None, to_date: Optional[DateObject] = None) -> QueryTimePeriod:
    """
    Determines the QueryTimePeriod object for the cost query.
    Azure SDK expects datetime objects.
    """
    today = datetime.now(timezone.utc).date() # Use UTC date

    if timeframe.lower() == "custom":
        if not from_date or not to_date:
            raise ValueError("from_date and to_date are required for Custom timeframe.")
        # Ensure from_date is before or same as to_date
        if from_date > to_date:
            raise ValueError("from_date cannot be after to_date for Custom timeframe.")
        start_datetime = datetime.combine(from_date, datetime.min.time())
        end_datetime = datetime.combine(to_date, datetime.max.time())
    else:
        # MAp common names to SDK TimeframeType if possible, or calculate
        if timeframe.lower() == "monthtodate":
            start_datetime = datetime.combine(today.replace(day=1), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
        elif timeframe.lower() == "yeartodate":
            start_datetime = datetime.combine(today.replace(month=1, day=1), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
        elif timeframe.lower() == "quartertodate":
            current_quarter = (today.month - 1) // 3 + 1
            first_month_of_quarter = (current_quarter - 1) * 3 + 1
            start_datetime = datetime.combine(
                today.replace(month=first_month_of_quarter, day=1),
                datetime.min.time()
            )
            end_datetime = datetime.combine(today, datetime.max.time())
        elif timeframe.lower() == "billingmonthtodate":
            start_datetime = datetime.combine(today.replace(day=1), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
        elif timeframe.lower() == "thelast7days":
            start_datetime = datetime.combine(today - timedelta(days=6), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
        elif timeframe.lower() == "thelastmonth":
            last_day_prev_month = today.replace(day=1) - timedelta(days=1)
            first_day_prev_month = last_day_prev_month.replace(day=1)
            start_datetime = datetime.combine(first_day_prev_month, datetime.min.time())
            end_datetime = datetime.combine(last_day_prev_month, datetime.max.time())
        elif timeframe.lower() == "thelast30days":
            start_datetime = datetime.combine(today - timedelta(days=29), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
        else:
            logger.warning(f"Unsupported timeframe string '{timeframe}', defaulting to MonthToDate.")
            start_datetime = datetime.combine(today.replace(day=1), datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())
    
    return QueryTimePeriod(from_property=start_datetime, to=end_datetime)

def _get_current_month_period() -> QueryTimePeriod:
    """
    Returns QueryTimePeriod from tomorrow to end of current month for forecast.
    If today is the last day of the month, or past, the period will be empty or invalid for forecast.
    """
    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)

    first_day_of_current_month = today.replace(day=1)
    # Find last day of current month
    if first_day_of_current_month.month == 12:
        last_day_of_current_month = first_day_of_current_month.replace(year=first_day_of_current_month.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        last_day_of_current_month = first_day_of_current_month.replace(month=first_day_of_current_month.month + 1, day=1) - timedelta(days=1)

    start_datetime = datetime.combine(first_day_of_current_month, datetime.min.time())
    end_datetime = datetime.combine(last_day_of_current_month, datetime.max.time())

    return QueryTimePeriod(from_property=start_datetime, to=end_datetime)

def _parse_cost_management_query_result(
        query_result: Any,
        include_resource_group_in_parsing: bool = True,
        expected_granularity: str = "None",
        entry_type: str = "actual"
) -> Tuple[float, str, Dict[str, float], List[Dict[str, Any]]]:
    """
    Parses the raw result from the Cost Management API query.
    Returns: total_cost, currency, costs_by_rg (if applicable), detailed_entries
    """
    total_overall_cost = 0.0
    currency = "USD"
    costs_by_rg: Dict[str, float] = {}
    detailed_entries_list: List[Dict[str, Any]] = [] # For table/list view of costs
    monthly_aggregated_costs: Dict[Tuple[int, int], float] = {} # For (year, month_num): cost, used for yearly breakdown
    RG_PREFIX_FILTER = "caz-"

    if not query_result or not hasattr(query_result, 'rows') or not hasattr(query_result, 'columns'):
        logger.warning("Query result is empty or malformed.")
        return total_overall_cost, currency, costs_by_rg, detailed_entries_list
    
    rows = query_result.rows
    if not rows:
        logger.debug("Query returned no data rows for this specific parsing context.")
        return total_overall_cost, currency, costs_by_rg, detailed_entries_list
    
    # Map column names to their indices for robust parsing
    column_map = {col.name.lower(): idx for idx, col in enumerate(query_result.columns)}
    logger.debug(f"Parsing query result with columns: {list(column_map.keys())}. include_rg_parsing: {include_resource_group_in_parsing}")
    if not include_resource_group_in_parsing and query_result.rows: # Log first few rows for monthly/forecast data
        if rows:
            logger.debug(f"Sample rows for non-RG (monthly/forecast) parsing (up to 3): {rows[:3]}")
    elif include_resource_group_in_parsing and query_result.rows:
        if rows:
            logger.debug(f"Sample rows for RG parsing (up to 3): {rows[:3]}")

    # Expected column names
    cost_col_name = "cost"
    currency_col_name = "currency"
    rg_col_name = "resourcegroupname"
    # For monthly granularity, Azure might return 'billingmonth', 'month', 'year' or 'usagedate' as first of month.
    # We'll try to be flexible.
    date_col_names_priority = ["usagedate", "billingmonth"] # Add other potential date column names if observed

    resource_id_col_name = "resourceid"
    # For monthly granularity, date might be just 'Month', 'Year' or a specific date format

    # Get indices safely
    cost_idx = column_map.get(cost_col_name)
    currency_idx = column_map.get(currency_col_name)
    rg_idx = column_map.get(rg_col_name) if include_resource_group_in_parsing else None
    
    date_idx = None
    for name in date_col_names_priority:
        if name in column_map:
            date_idx = column_map[name]
            logger.debug(f"Using date column '{name}' at index {date_idx} for parsing.")
            break
    resource_id_idx = column_map.get(resource_id_col_name)


    if cost_idx is None or currency_idx is None:
        original_column_names = [col.name for col in query_result.columns]
        logger.warning(f"Essential columns '{cost_col_name}' or '{currency_col_name}' not found in query result. Columns: {column_map.keys()}")
        raise ValueError(f"Essential columns missing in query result. Cannot parse costs. Found: {original_column_names}")
    

    for row_data in rows:
        try:
            cost = float(row_data[cost_idx])
            row_currency = str(row_data[currency_idx])
            if currency == "USD" and row_currency:
                currency = row_currency

            total_overall_cost += cost

            entry: Dict[str, Any] = {
                "amount": round(cost, 2),
                "currency": row_currency,
                "entry_type": entry_type
            }
            
            rg_name_from_row = None
            is_actual_cost_col_name = "isactualcost"
            is_actual_cost_idx = column_map.get(is_actual_cost_col_name)

            if rg_idx is not None and len(row_data) > rg_idx and row_data[rg_idx] is not None:
                rg_name_from_row = str(row_data[rg_idx])
            entry["resourceGroupName"] = rg_name_from_row if rg_name_from_row else "N/A"

            resource_id_from_row = None
            # Corrected condition: check against resource_id_idx for length, not rg_idx
            if resource_id_idx is not None and len(row_data) > resource_id_idx and row_data[resource_id_idx] is not None:
                resource_id_from_row = str(row_data[resource_id_idx])
            entry["resourceId"] = resource_id_from_row

            parsed_date_for_monthly_agg = None
            parsed_date_str = None # New variable to hold the YYYY-MM-DD string
            if date_idx is not None and len(row_data) > date_idx and row_data[date_idx] is not None:
                # UsageDate is often an integer (YYYYMMDD) or a string representation
                date_val = row_data[date_idx]
                logger.debug(f"Attempting to parse date_val: {date_val} (type: {type(date_val)}) for monthly agg: {not include_resource_group_in_parsing}")
                try:
                    if isinstance(date_val, int): # YYYYMMDD format
                        parsed_date_for_monthly_agg = datetime.strptime(str(date_val), "%Y%m%d")
                        parsed_date_str = parsed_date_for_monthly_agg.strftime("%Y-%m-%d")
                    elif isinstance(date_val, str):
                        date_str_to_parse = date_val.split("T")[0] # Get YYYY-MM-DD part
                        if len(date_str_to_parse) == 10 and date_str_to_parse.count('-') == 2: # YYYY-MM-DD
                            parsed_date_for_monthly_agg = datetime.strptime(date_str_to_parse, "%Y-%m-%d")
                            parsed_date_str = date_str_to_parse
                        elif len(date_str_to_parse) == 8 and date_str_to_parse.isdigit(): # YYYYMMDD as string
                            parsed_date_for_monthly_agg = datetime.strptime(date_str_to_parse, "%Y%m%d")
                            parsed_date_str = parsed_date_for_monthly_agg.strftime("%Y-%m-%d")
                        else: # Fallback to fromisoformat for more complex ISO strings
                            parsed_date_for_monthly_agg = datetime.fromisoformat(date_val.replace("Z", "+00:00").split("T")[0])
                            parsed_date_str = parsed_date_for_monthly_agg.strftime("%Y-%m-%d")
                    else:
                        logger.debug(f"Unsupported date type {type(date_val)} for value {date_val}")
                except ValueError:
                    logger.debug(f"Could not parse date string {date_val} into YYYY-MM-DD format.")
            entry["date"] = parsed_date_str

            # Determine entry type, using IsActualCost if available, otherwise fallback to date check
            final_entry_type = entry_type # Start with the passed-in default
            if is_actual_cost_idx is not None and len(row_data) > is_actual_cost_idx and row_data[is_actual_cost_idx] is not None:
                # Primary method: Use the 'IsActualCost' boolean column from the forecast API
                final_entry_type = "actual" if row_data[is_actual_cost_idx] else "forecast"
            elif parsed_date_str and expected_granularity.lower() == 'daily':
                # Fallback for daily granularity if IsActualCost is missing: check if the date is in the future
                entry_date_obj = DateObject.fromisoformat(parsed_date_str)
                if entry_date_obj > datetime.now(timezone.utc).date():
                    final_entry_type = "forecast"
            entry["entry_type"] = final_entry_type

            if include_resource_group_in_parsing and rg_name_from_row:
                if rg_name_from_row.startswith(RG_PREFIX_FILTER):
                    costs_by_rg[rg_name_from_row] = costs_by_rg.get(rg_name_from_row, 0.0) + cost
            
            # For monthly aggregation, if granularity was monthly
            if parsed_date_for_monthly_agg and not include_resource_group_in_parsing: # Assuming this path is for monthly totals
                logger.debug(f"Aggregating for monthly: Year {parsed_date_for_monthly_agg.year}, Month {parsed_date_for_monthly_agg.month}, Cost {cost}")
                monthly_aggregated_costs[(parsed_date_for_monthly_agg.year, parsed_date_for_monthly_agg.month)] = monthly_aggregated_costs.get((parsed_date_for_monthly_agg.year, parsed_date_for_monthly_agg.month), 0.0) + cost

            keep_entry = False
            if include_resource_group_in_parsing:
                # Only try to filter by prefix if we are actually parsing RGs and rg_name_from_row is not None
                if rg_name_from_row and rg_name_from_row.startswith(RG_PREFIX_FILTER):
                    keep_entry = True
            else:
                # If not parsing by RG (e.g. for MTD/Forecast totals), we want to keep the entry
                # as it represents the aggregated total for that query.
                keep_entry = True # Keep the aggregated row for MTD/Forecast

            if keep_entry:
                detailed_entries_list.append(entry)
        except (IndexError, TypeError, ValueError) as e:
            logger. warning(f"Skipping malformed row or type conversion error: {row_data} - {e}")
            continue
    
    # Round the values in costs_by_rg
    for rg, val in costs_by_rg.items():
        costs_by_rg[rg] = round(val, 2)
    
    # If this function was called to get monthly aggregates, return that instead of detailed_entries_list
    # The condition for returning the monthly dictionary should be very specific.
    if not include_resource_group_in_parsing and expected_granularity.lower() == 'monthly' and monthly_aggregated_costs:
         logger.info(f"Returning monthly aggregated costs dictionary: {monthly_aggregated_costs}")
         return round(total_overall_cost, 2), currency, monthly_aggregated_costs, [] # Return dict for monthly costs
    return round(total_overall_cost, 2), currency, costs_by_rg, detailed_entries_list # For all other cases


# --- API Service Functions ---

async def list_accessible_subscriptions(access_token: str, token_expires_on: Optional[int] = None) -> List[AzureSubscription]:
    """Lists all Azure subscriptions accessible to the user's credentials."""
    if not access_token:
        raise ValueError("Access token is required to list subscriptions.")
    sub_client = get_subscription_client(user_access_token=access_token, user_token_expires_on=token_expires_on)
    subscriptions_list = []
    try:
        # Note: SDK list operations are iterators, not directly awaitable.
        # To make this async, you would typically run it in a thread.
        # For simplicity here, we'll call it directly. FastAPI handles sync functions in async routes.
        for sub in sub_client.subscriptions.list():
            subscriptions_list.append(
                AzureSubscription(
                    id=sub.id,
                    subscription_id=sub.subscription_id,
                    display_name=sub.display_name,
                    state=str(sub.state) if sub.state else "N/A"
                )
            )
        return subscriptions_list
    except HttpResponseError as e:
        # Extract retry-after header if available for 429 errors
        retry_after = e.response.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after', '0') if e.status_code == 429 else '0'
        logger.warning(f"Azure API Error listing subscriptions: {e.message} - Details: {e.error.message if e.error else 'N/A'} - Retry-After: {retry_after}")
        raise HTTPException(
            status_code=e.status_code if hasattr(e, 'status_code') else 500,
            detail=f"Azure API Error: {e.error.message if e.error else e.message}. Retry-After: {retry_after}"
        )
    except Exception as e:
        logger.warning(f"Unexpected error listing subscriptions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


async def query_subscription_costs(
    access_token: str,
    subscription_id: str,
    timeframe: str,
    granularity: str, # "Daily", "Monthly", "None",
    tag_filters: Optional[List[dict]] = None,
    from_date: Optional[DateObject] = None,
    to_date: Optional[DateObject] = None,
    token_expires_on: Optional[int] = None
) -> Tuple[float, str, Dict[str, float], List[Dict[str, Any]], QueryTimePeriod, Optional[float], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Queries cost data for a subscription using the user's token.
    Returns: total_cost, currency, costs_by_rg, detailed_entries, time_period_used"""
    if not access_token:
        raise ValueError("Access token is required to query subscription costs.")
    cost_mgmt_client = get_cost_management_client(user_access_token=access_token, user_token_expires_on=token_expires_on)
    scope = f"/subscriptions/{subscription_id}"
    time_period_obj = _determine_time_period(timeframe, from_date, to_date)

    current_year = datetime.now(timezone.utc).year
    month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    grouping = [
        QueryGrouping(name="ResourceGroupName", type="Dimension"),
        QueryGrouping(name="ResourceID", type="Dimension")
    ]


    query_definition = QueryDefinition(
        type=ExportType.ACTUAL_COST, # "ActualCost"
        timeframe=TimeframeType.CUSTOM, # We use custom because QueryTimePeriod is explicit
        time_period=time_period_obj,
        dataset=QueryDataset(
            granularity=granularity if granularity.lower() != "none" else None, # API expects None for total, not string "None"
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=grouping,
            filter=None # Initialize filter as None
        )
    )

    # Apply tag filters if provided
    if tag_filters:
        # tag_filters is a list of dicts like:
        # [{"name": "tag_key", "operator": "In", "values": ["value1"]}]
        filter_expressions = []
        for tf in tag_filters:
            filter_expressions.append(
                QueryFilter(tags=QueryComparisonExpression(name=tf["name"], operator=tf["operator"], values=tf["values"]))
            )

        if len(tag_filters) == 1:
            query_definition.dataset.filter = filter_expressions[0]
        elif len(filter_expressions) > 1:
            query_definition.dataset.filter = QueryFilter(and_property=filter_expressions)

    logger.info(f"Querying cost for scope: {scope} with granularity '{granularity}', timeframe: {timeframe} ({time_period_obj.from_property} to {time_period_obj.to})")
    logger.debug(f"Query definition: {query_definition.serialize(keep_readonly=True)}")

    try:
        # This is a synchronous call. For a truly async FastAPI, wrap with asyncio.to_thread
        # result = await asyncio.to_thread(cost_mgmt_client.query.usage, scope=scope, parameters=query_definition)
        result = cost_mgmt_client.query.usage(scope=scope, parameters=query_definition)
        total, currency, by_rg, entries = _parse_cost_management_query_result(result, include_resource_group_in_parsing=True, expected_granularity=granularity)

        # --- Fetch Yearly Monthly Breakdown ---
        # This will be derived from the daily data fetch below to reduce API calls.

        # --- Fetch Yearly Daily Breakdown (Actuals + Forecasts) ---
        yearly_daily_breakdown_list: List[Dict[str, Any]] = []
        try:
            time_period_yearly_daily = QueryTimePeriod(
                from_property=datetime(current_year, 1, 1, tzinfo=timezone.utc),
                to=datetime(current_year, 12, 31, 23, 59, 59, tzinfo=timezone.utc) # Entire year
            )
            forecast_def_yearly_daily = ForecastDefinition(
                type="ActualCost", timeframe=TimeframeType.CUSTOM, time_period=time_period_yearly_daily,
                include_actual_cost=True,
                dataset=QueryDataset(
                    granularity="Daily",
                    aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                    filter=query_definition.dataset.filter # Apply same tag filters
                )
            )
            logger.debug(f"Querying yearly daily actuals and forecasts (combined): {forecast_def_yearly_daily.serialize(keep_readonly=True)}")
            daily_combined_result = cost_mgmt_client.forecast.usage(scope=scope, parameters=forecast_def_yearly_daily)
            _, _, _, yearly_daily_breakdown_list = _parse_cost_management_query_result(daily_combined_result, include_resource_group_in_parsing=False, expected_granularity="Daily")
        except HttpResponseError as e_daily_combined:
            # Extract retry-after header if available for 429 errors during forecast query
            retry_after = e_daily_combined.response.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after', '0') if e_daily_combined.status_code == 429 else '0'
            logger.warning(f"Azure API Error fetching yearly daily combined actual/forecast data for {subscription_id}: {e_daily_combined.message} - Retry-After: {retry_after}", exc_info=True)
        except Exception as e_daily_combined:
            logger.warning(f"Could not fetch yearly daily combined actual/forecast data for {subscription_id}: {e_daily_combined}", exc_info=True)

        # --- Derive Monthly Breakdown from Daily Data ---
        projected_total_for_month = None
        derived_yearly_monthly_breakdown: List[Dict[str, Any]] = []
        current_month = datetime.now(timezone.utc).month

        if yearly_daily_breakdown_list:
            monthly_data = {m: {'actual': 0.0, 'forecast': 0.0} for m in range(1, 13)}
            for entry in yearly_daily_breakdown_list:
                entry_date = DateObject.fromisoformat(entry['date'])
                month = entry_date.month
                if entry['entry_type'] == 'actual':
                    monthly_data[month]['actual'] += entry['amount']
                elif entry['entry_type'] == 'forecast':
                    monthly_data[month]['forecast'] += entry['amount']

            for i in range(1, 13):
                month_num = i
                month_actual_sum = monthly_data[month_num]['actual']
                month_forecast_sum = monthly_data[month_num]['forecast']
                
                final_actual = None
                final_forecast = None

                if month_num < current_month:
                    # Past month: only has actuals
                    final_actual = round(month_actual_sum, 2) if month_actual_sum > 0.005 else None
                elif month_num == current_month:
                    # Current month: has actuals so far, and a total projection
                    final_actual = round(month_actual_sum, 2) if month_actual_sum > 0.005 else None
                    final_forecast = round(month_actual_sum + month_forecast_sum, 2)
                else: # month_num > current_month
                    # Future month: only has a forecast. Actuals should be 0.
                    final_forecast = round(month_forecast_sum, 2) if month_forecast_sum > 0.005 else None

                derived_yearly_monthly_breakdown.append({
                    "month": month_labels[i-1], "year": current_year,
                    "actual": final_actual, "forecast": final_forecast
                })
            
            projected_total_for_month = derived_yearly_monthly_breakdown[current_month - 1]['forecast']

        return total, currency, by_rg, entries, time_period_obj, projected_total_for_month, derived_yearly_monthly_breakdown, yearly_daily_breakdown_list
    except HttpResponseError as e:
        # Extract retry-after header if available for 429 errors
        retry_after = e.response.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after', '0') if e.status_code == 429 else '0'
        error_details = e.message
        if e.error and e.error.message: # Try to get more specific Azure error
            error_details = e.error.message
        elif e.response and e.response.text:
            error_details = e.response.text
        logger.warning(f"Azure API Error querying subscription costs for {subscription_id}: {error_details} - Retry-After: {retry_after}", exc_info=True)
        raise HTTPException(
            status_code=e.status_code if hasattr(e, 'status_code') else 500,
            detail=f"Azure API Error: {error_details}. Retry-After: {retry_after}"
        )
    except ValueError as e:  # Catch parsing errors or bad input from _determine_time_period
        logger.warning(f"ValueError during cost query for subscription {subscription_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.warning(f"Unexpected error querying subscription costs for {subscription_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


async def query_resource_group_costs(
    access_token: str,
    subscription_id: str,
    resource_group_name: str,
    timeframe: str,
    granularity: str, # "Daily", "Monthly", "None",
    tag_filters: Optional[List[dict]] = None,
    from_date: Optional[DateObject] = None,
    to_date: Optional[DateObject] = None,
    token_expires_on: Optional[int] = None
) -> Tuple[float, str, List[Dict[str, Any]], QueryTimePeriod]:
    """Queries cost data for a specific resource group using the user's token.
    Returns: total_cost, currency, detailed_entries, time_period_used"""
    if not access_token:
        raise ValueError("Access token is required to query resource group costs.")
    cost_mgmt_client = get_cost_management_client(user_access_token=access_token, user_token_expires_on=token_expires_on)
    # Scope for a resource group
    scope = f"/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}"
    time_period_obj = _determine_time_period(timeframe, from_date, to_date)

    grouping = [
        QueryGrouping(name="ResourceID", type="Dimension")
    ]
    # You might want to group by other dimensions as well, e.g., ServiceName, Meter
    # grouping.append(QueryGrouping(name="ServiceName", type="Dimension"))

    query_definition = QueryDefinition(
        type=ExportType.ACTUAL_COST,
        timeframe=TimeframeType.CUSTOM,
        time_period=time_period_obj,
        dataset=QueryDataset(
            granularity=granularity if granularity.lower() != "none" else None,
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=grouping if grouping else None,
            filter=None # Initialize filter
        )
    )

    # Apply tag filters if provided
    if tag_filters:
        filter_expressions_rg = []
        for tf in tag_filters:
            filter_expressions_rg.append(
                QueryFilter(tags=QueryComparisonExpression(name=tf["name"], operator=tf["operator"], values=tf["values"]))
            )
        
        if len(filter_expressions_rg) == 1:
            query_definition.dataset.filter = filter_expressions_rg[0]
        elif len(filter_expressions_rg) > 1:
            query_definition.dataset.filter = QueryFilter(and_property=filter_expressions_rg)

    logger.info(f"Querying cost for RG scope: {scope} with granularity '{granularity}', timeframe: {timeframe} ({time_period_obj.from_property} to {time_period_obj.to})")
    logger.debug(f"Query definition: {query_definition.serialize(keep_readonly=True)}")

    try:
        result = cost_mgmt_client.query.usage(scope=scope, parameters=query_definition)
        # For RG specific query, we don't re-parse costs_by_rg, as it's all for this RG.
        total, currency, _, entries = _parse_cost_management_query_result(result, include_resource_group_in_parsing=False, expected_granularity=granularity)
        return total, currency, entries, time_period_obj
    except HttpResponseError as e:
        # Extract retry-after header if available for 429 errors
        retry_after = e.response.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after', '0') if e.status_code == 429 else '0'
        error_details = e.message
        if e.error and e.error.message: 
            error_details = e.error.message
        elif e.response and e.response.text: 
            error_details = e.response.text
        logger.warning(f"Azure API Error querying RG costs for {resource_group_name} in {subscription_id}: {error_details} - Retry-After: {retry_after}", exc_info=True)
        raise HTTPException(
            status_code=e.status_code if hasattr(e, 'status_code') else 500,
            detail=f"Azure API Error: {error_details}. Retry-After: {retry_after}"
        )
    except ValueError as e:
        logger.warning(f"ValueError during cost query for RG {resource_group_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.warning(f"Unexpected error querying RG costs for {resource_group_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


async def generate_cost_report_file(
    subscription_id: str,
    cost_data_entries: List[Dict[str, Any]],
    timeframe_str: str,
    granularity_str: str,
    file_format: str = "csv" # "csv" or "excel"
    # access_token and token_expires_on are not directly used here as data is pre-fetched,
    # but if file generation involved further Azure calls, they would be needed.
) -> str:
    """
    Generates a cost report file (CSV or Excel) from parsed cost data.
    Returns the path to the created file.
    """
    if not cost_data_entries:
        logger.warning("No data provided for report generation.")
        # Create an empty file or raise an error
        # For now, let it proceed and create an empty file if that's the pandas behavior
        pass # Fall through to pandas handling

    df = pd.DataFrame(cost_data_entries)

    # Sanitize inputs for filename
    safe_sub_id = subscription_id.replace("-", "")
    safe_timeframe = timeframe_str.replace(" ", "_").lower()
    safe_granularity = granularity_str.replace(" ", "_").lower()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    base_filename = f"cost_report_{safe_sub_id}_{safe_timeframe}_{safe_granularity}_{timestamp}"

    if file_format.lower() == "excel":
        file_path = os.path.join(GENERATED_REPORTS_DIR, f"{base_filename}.xlsx")
        try:
            df.to_excel(file_path, index=False, engine='openpyxl')
        except Exception as e:
            logger.warning(f"Error writing Excel file {file_path}: {e}", exc_info=True)
            raise IOError(f"Failed to generate Excel report: {e}")
    elif file_format.lower() == "csv":
        file_path = os.path.join(GENERATED_REPORTS_DIR, f"{base_filename}.csv")
        try:
            df.to_csv(file_path, index=False)
        except Exception as e:
            logger.warning(f"Error writing CSV file {file_path}: {e}", exc_info=True)
            raise IOError(f"Failed to generate CSV report: {e}")
    else:
        raise ValueError("Unsupported file format. Choose 'csv' or 'excel'.")

    logger.info(f"Successfully created cost report: {file_path}")
    return file_path

async def list_available_tags_for_subscription(access_token: str, subscription_id: str, token_expires_on: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Lists all tag names and their distinct values for a given subscription.
    Uses azure-mgmt-resource.
    """
    if not access_token:
        raise ValueError("Access token is required to list available tags.")
    
    # For ResourceManagementClient, subscription_id is often passed per-operation or set at client init.
    # We'll pass it to the operation if the SDK structure requires it, or ensure client is specific.
    # The client itself needs a subscription_id at initialization, even if it's a dummy one for some operations.
    # The actual subscription_id for the 'tags.list' operation is part of the scope.
    
    # The ResourceManagementClient needs the subscription_id at initialization.
    resource_mgmt_client = ResourceManagementClient(
        credential=CustomBearerTokenCredential(access_token, token_expires_on),
        subscription_id=subscription_id, # Crucial for this client
        base_url=endpoint
    )

    tags_list: List[Dict[str, Any]] = []
    try:
        # The tags.list operation is on the client itself, not a sub-client like 'subscriptions'.
        # It operates on the subscription_id the client was initialized with.
        logger.info(f"Calling resource_mgmt_client.tags.list() for subscription {subscription_id}")
        for tag_details in resource_mgmt_client.tags.list(): # This is a paged operation
            logger.debug(f"Raw tag_details from SDK for sub {subscription_id}: Name: {tag_details.tag_name}, Values count: {len(tag_details.values) if tag_details.values else 0}")
            tags_list.append({
                "tagName": tag_details.tag_name,
                "values": [tv.tag_value for tv in tag_details.values] if tag_details.values else []
            })
        logger.info(f"Processed tags for subscription {subscription_id}: {tags_list}")
        return tags_list
    except HttpResponseError as e:
        # Extract retry-after header if available for 429 errors
        retry_after = e.response.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after', '0') if e.status_code == 429 else '0'
        logger.warning(f"Azure API Error listing tags for subscription {subscription_id}: {e.message} - Retry-After: {retry_after}", exc_info=True)
        raise HTTPException(
            status_code=e.status_code if hasattr(e, 'status_code') else 500,
            detail=f"Azure API Error listing tags: {e.message}. Retry-After: {retry_after}"
        )
    except Exception as e:
        logger.warning(f"Unexpected error listing tags for subscription {subscription_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while listing tags: {str(e)}")