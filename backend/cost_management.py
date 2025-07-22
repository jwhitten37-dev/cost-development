import logging
import os
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Depends, BackgroundTasks, Request, Security
from fastapi.responses import FileResponse
from datetime import date
import time
import random

from app.core.azure_client import (
    list_accessible_subscriptions,
    query_subscription_costs,
    query_resource_group_costs,
    generate_cost_report_file,
    GENERATED_REPORTS_DIR,
    list_available_tags_for_subscription
)
from app.models.cost import (
    AzureSubscription,
    SubscriptionCostDetails,
    ResourceGroupCostDetails,
    CostQueryRequest,
    ReportCreationResponse,
    CostEntry,
    TagDetailsResponse
)
from app.core.security import oauth2_scheme

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/subscriptions/batch-costs", response_model=List[SubscriptionCostDetails])
async def get_batch_subscription_costs(
    subscription_ids: List[str] = Body(..., description="List of subscription IDs to fetch costs for"),
    timeframe: str = Body("MonthToDate", description="Timeframe (MonthToDate, TheLast7Days, Custom)"),
    from_date_str: Optional[str] = Body(None, alias="from_date", description="Start date for Custom timeframe (YYYY-MM-DD)"),
    to_date_str: Optional[str] = Body(None, alias="to_date", description="End date for Custom timeframe (YYYY-MM-DD)"),
    granularity: str = Body("None", description="Granularity (Daily, Monthly, None for total)"),
    token: str = Security(oauth2_scheme)
):
    """
    Fetch cost data for multiple subscriptions in a single batch request.
    Implements exponential backoff for handling 429 Too Many Requests errors from Azure API.
    """
    results = []
    max_retries = 3  # Maximum number of retries for 429 errors
    base_delay = 1    # Base delay in seconds for exponential backoff

    for subscription_id in subscription_ids:
        attempt = 0
        while attempt < max_retries:
            try:
                # Fetch cost data for each subscription
                actual_total, currency, by_rg, entries, time_period, projected_eom_cost, yearly_breakdown, yearly_daily_breakdown = await query_subscription_costs(
                    access_token=token,
                    subscription_id=subscription_id,
                    timeframe=timeframe,
                    granularity=granularity,
                    from_date=date.fromisoformat(from_date_str) if from_date_str else None,
                    to_date=date.fromisoformat(to_date_str) if to_date_str else None
                )
                results.append(SubscriptionCostDetails(
                    subscription_id=subscription_id,
                    subscription_name=subscription_id,  # Replace with actual name if available
                    total_cost=actual_total if actual_total is not None else 0.0,
                    currency=currency if currency else "USD",
                    costs_by_resource_group=by_rg if by_rg else {},
                    detailed_entries=[CostEntry.model_validate(e) for e in entries] if entries else [],
                    timeframe_used=timeframe,
                    from_date_used=time_period.from_property.date().isoformat() if time_period.from_property else None,
                    to_date_used=time_period.to.date().isoformat() if time_period.to else None,
                    granularity_used=granularity,
                    projected_cost_current_month=projected_eom_cost if projected_eom_cost is not None else 0.0,
                    yearly_monthly_breakdown=yearly_breakdown if yearly_breakdown else [],
                    yearly_daily_breakdown=yearly_daily_breakdown if yearly_daily_breakdown else []
                ))
                break  # Success, move to next subscription
            except Exception as e:
                attempt += 1
                if "429" in str(e) or "Too many requests" in str(e).lower():
                    retry_after = 0
                    # Extract retry-after from exception if available (depends on how azure_client.py handles it)
                    # For simplicity, we'll use exponential backoff with jitter
                    delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.1 * base_delay)
                    logger.warning(f"429 error for subscription {subscription_id}. Retrying after {delay:.2f} seconds (attempt {attempt}/{max_retries})")
                    time.sleep(delay)
                    if attempt == max_retries:
                        logger.error(f"Max retries reached for subscription {subscription_id}. Returning default response.")
                        results.append(SubscriptionCostDetails(
                            subscription_id=subscription_id,
                            subscription_name=subscription_id,
                            total_cost=0.0,
                            currency="USD",
                            costs_by_resource_group={},
                            detailed_entries=[],
                            timeframe_used=timeframe,
                            from_date_used=None,
                            to_date_used=None,
                            granularity_used=granularity,
                            projected_cost_current_month=0.0,
                            yearly_monthly_breakdown=[],
                            yearly_daily_breakdown=[]
                        ))
                else:
                    logger.warning(f"Failed to fetch cost data for subscription {subscription_id}: {e}")
                    results.append(SubscriptionCostDetails(
                        subscription_id=subscription_id,
                        subscription_name=subscription_id,
                        total_cost=0.0,
                        currency="USD",
                        costs_by_resource_group={},
                        detailed_entries=[],
                        timeframe_used=timeframe,
                        from_date_used=None,
                        to_date_used=None,
                        granularity_used=granularity,
                        projected_cost_current_month=0.0,
                        yearly_monthly_breakdown=[],
                        yearly_daily_breakdown=[]
                    ))
                    break  # Non-429 error, don't retry
    return results

@router.get("/subscriptions", response_model=List[AzureSubscription])
async def get_subscriptions_list(token: str = Security(oauth2_scheme)):
    """Lists all Azure subscriptions accessible to the application."""
    # The 'token' is the user's bearer token.
    # The CustomStaticBearerTokenCredential in azure_client.py will use this token.
    # For now, we are not passing token_expires_on, so the custom credential will use its default.
    # TODO: Consider passing token_expires_on from frontend if more precise expiry handling is needed.
    try:
        subscriptions = await list_accessible_subscriptions(access_token=token)
        if not subscriptions:
            # This is not an error, just no subscriptions found or accessible
            logger.info("No subscriptions found or accessible by the service principal.")
            return []
        return subscriptions
    except HTTPException: # Re-raise HTTPExceptions from azure_client
        raise
    except Exception as e:
        logger.warning(f"API Error: Failed to retrieve subscriptions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve subscriptions: {str(e)}")


@router.get("/subscriptions/{subscription_id}/costs", response_model=SubscriptionCostDetails)
async def get_subscription_costs_summary(
    subscription_id: str,
    request: Request, # To access query_params for tags and raw date strings
    timeframe: str = Query("MonthToDate", description="Timeframe (MonthToDate, TheLast7Days, Custom)"),
    from_date_str: Optional[str] = Query(None, alias="from_date", description="Start date for Custom timeframe (YYYY-MM-DD)"),
    to_date_str: Optional[str] = Query(None, alias="to_date", description="End date for Custom timeframe (YYYY-MM-DD)"),
    granularity: str = Query("None", description="Granularity (Daily, Monthly, None for total)"),
    token: str = Security(oauth2_scheme)
):
    """
    Get overall spending for a specific subscription, with adjustable time frames
    and granularity. Returns data including breakdown by resource group.
    Supports filtering by tags passed as query parameters, e.g.:
    - `tag_Environment=Production`
    - `tag_CostCenter_ne=123` (for not equals)
    """
    # Manually parse date strings, handling "null"
    parsed_from_date: Optional[date] = None
    if from_date_str and from_date_str.lower() != "null":
        try:
            parsed_from_date = date.fromisoformat(from_date_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid from_date format: {from_date_str}. Expected YYYY-MM-DD.")

    parsed_to_date: Optional[date] = None
    if to_date_str and to_date_str.lower() != "null":
        try:
            parsed_to_date = date.fromisoformat(to_date_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid to_date format: {to_date_str}. Expected YYYY-MM-DD.")

    tag_filters: List[Dict[str, Any]] = []
    for key, value in request.query_params.items():
        if key.startswith("tag_"):
            parts = key.split("_", 1)
            if len(parts) < 2: continue # Should not happen if starts with "tag_"

            tag_key_full = parts[1]
            operator = "In" # Default operator for equals
            tag_actual_key = tag_key_full

            if tag_key_full.endswith("_ne"): # Not Equals
                operator = "NotIn"
                tag_actual_key = tag_key_full[:-3] # Remove _ne suffix
            
            tag_filters.append({
                "name": tag_actual_key,
                "operator": operator,
                "values": [value] # Azure SDK expects a list of values for 'In' or 'NotIn'
            })

    # Validate custom timeframe dates after parsing
    if timeframe.lower() == "custom":
        if not parsed_from_date or not parsed_to_date:
            raise HTTPException(status_code=400, detail="from_date and to_date are required for Custom timeframe.")
        if parsed_from_date > parsed_to_date:
            raise HTTPException(status_code=400, detail="from_date cannot be after to_date.")

    try:
        actual_total, currency, by_rg, entries, time_period, projected_eom_cost, yearly_breakdown, yearly_daily_breakdown = await query_subscription_costs(
            access_token=token,
            subscription_id=subscription_id,
            timeframe=timeframe,
            granularity=granularity,
            from_date=parsed_from_date,
            to_date=parsed_to_date,
            tag_filters=tag_filters # Pass parsed tag filters
        )

        # Find subscription display name (optional, could be done on frontend)
        # For now, just use ID. Could fetch all subs once and cache.
        sub_name = subscription_id

        return SubscriptionCostDetails(
            subscription_id=subscription_id,
            subscription_name=sub_name,
            total_cost=actual_total,
            currency=currency,
            costs_by_resource_group=by_rg,
            detailed_entries=[CostEntry.model_validate(e) for e in entries], # Validate against Pydantic model
            timeframe_used=timeframe, # Use the direct timeframe parameter
            from_date_used=time_period.from_property.date().isoformat() if time_period.from_property else None,
            to_date_used=time_period.to.date().isoformat() if time_period.to else None,
            granularity_used=granularity, # Use the direct granularity parameter
            projected_cost_current_month=projected_eom_cost,
            yearly_monthly_breakdown=yearly_breakdown,
            yearly_daily_breakdown=yearly_daily_breakdown
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"API Error fetching subscription costs for {subscription_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@router.get("/subscriptions/{subscription_id}/resourcegroups/{resource_group_name}/costs", response_model=ResourceGroupCostDetails)
async def get_single_resource_group_costs(
    subscription_id: str,
    resource_group_name: str,
    timeframe: str = Query("MonthToDate", description="Timeframe (MonthToDate, TheLast7Days, Custom)"),
    from_date_str: Optional[str] = Query(None, alias="from_date", description="Start date for Custom timeframe (YYYY-MM-DD)"),
    to_date_str: Optional[str] = Query(None, alias="to_date", description="End date for Custom timeframe (YYYY-MM-DD)"),
    granularity: str = Query("None", description="Granularity (Daily, Monthly, None for total)"),
    token: str = Security(oauth2_scheme)
):
    """Get spending for a specific resource group within a subscription."""
    # Manually parse date strings, handling "null"
    parsed_from_date_rg: Optional[date] = None
    if from_date_str and from_date_str.lower() != "null":
        try: parsed_from_date_rg = date.fromisoformat(from_date_str)
        except ValueError: raise HTTPException(status_code=400, detail=f"Invalid from_date format: {from_date_str}. Expected YYYY-MM-DD.")
    parsed_to_date_rg: Optional[date] = None
    if to_date_str and to_date_str.lower() != "null":
        try: parsed_to_date_rg = date.fromisoformat(to_date_str)
        except ValueError: raise HTTPException(status_code=400, detail=f"Invalid to_date format: {to_date_str}. Expected YYYY-MM-DD.")
    try:
        logger.info(f"Fetching costs for RG: {resource_group_name} in sub: {subscription_id}, timeframe: {timeframe}, granularity: {granularity}")
        total, currency, entries, time_period = await query_resource_group_costs(
            access_token=token,
            subscription_id=subscription_id,
            resource_group_name=resource_group_name,
            timeframe=timeframe,
            granularity=granularity,
            from_date=parsed_from_date_rg, 
            to_date=parsed_to_date_rg 
        )
        return ResourceGroupCostDetails(
            subscription_id=subscription_id,
            resource_group_name=resource_group_name,
            total_cost=total,
            currency=currency,
            detailed_entries=[CostEntry.model_validate(e) for e in entries],
            timeframe_used=timeframe, # Use the direct timeframe parameter
            from_date_used=time_period.from_property.date().isoformat() if time_period.from_property else None,
            to_date_used=time_period.to.date().isoformat() if time_period.to else None,
            granularity_used=granularity # Use the direct granularity parameter
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"API Error fetching RG costs for {resource_group_name} in {subscription_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

@router.post("/subscriptions/{subscription_id}/costs/generate-report", response_model=ReportCreationResponse)
async def create_cost_report_for_subscription(
    subscription_id: str,
    request: Request, # To construct download URL
    timeframe: str = Body("MonthToDate", description="Timeframe (MonthToDate, TheLast7Days, Custom)"),
    from_date_str: Optional[str] = Body(None, alias="from_date", description="Start date for Custom timeframe (YYYY-MM-DD)"),
    to_date_str: Optional[str] = Body(None, alias="to_date", description="End date for Custom timeframe (YYYY-MM-DD)"),
    granularity: str = Body("None", description="Granularity (Daily, Monthly, None for total)"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    file_format: str = Query("csv", enum=["csv", "excel"]),
    token: str = Security(oauth2_scheme)):
    """
    Generates a cost report file (CSV or Excel) for a subscription and returns a download link.
    The actual file generation is done via query_subscription_costs then generate_cost_report_file.
    """
    try:
        # Manually parse date strings from body, handling "null"
        parsed_from_date: Optional[date] = None
        if from_date_str and from_date_str.lower() != "null":
            try:
                parsed_from_date = date.fromisoformat(from_date_str)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid from_date format: {from_date_str}. Expected YYYY-MM-DD.")

        parsed_to_date: Optional[date] = None
        if to_date_str and to_date_str.lower() != "null":
            try:
                parsed_to_date = date.fromisoformat(to_date_str)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid to_date format: {to_date_str}. Expected YYYY-MM-DD.")

        tag_filters: List[Dict[str, Any]] = []
        # Parse tag filters from the query parameters of the POST request URL, if any.
        # Note: Typically, for POST, filters might be in the body, but current frontend sends them in URL.
        for key, value in request.query_params.items():
            if key.startswith("tag_"):
                parts = key.split("_", 1)
                if len(parts) < 2: continue

                tag_key_full = parts[1]
                operator = "In"
                tag_actual_key = tag_key_full

                if tag_key_full.endswith("_ne"):
                    operator = "NotIn"
                    tag_actual_key = tag_key_full[:-3]
                
                tag_filters.append({
                    "name": tag_actual_key,
                    "operator": operator,
                    "values": [value]
                })

        # Validate custom timeframe dates after parsing
        if timeframe.lower() == "custom":
            if not parsed_from_date or not parsed_to_date:
                raise HTTPException(status_code=400, detail="from_date and to_date are required for Custom timeframe.")
            if parsed_from_date > parsed_to_date:
                raise HTTPException(status_code=400, detail="from_date cannot be after to_date.")

        logger.info(f"Request to generate {file_format} report for sub: {subscription_id}, timeframe: {timeframe}, granularity: {granularity}")
        # 1. Fetch the data (similar to get_subscription_costs_summary)
        _, _, _, entries, _, _, _ = await query_subscription_costs( # Adjusted for new return values
            access_token=token,
            subscription_id=subscription_id,
            timeframe=timeframe,
            granularity=granularity, # Use specified granularity for the report
            from_date=parsed_from_date,
            to_date=parsed_to_date,
            tag_filters=tag_filters # Apply tag filters to data fetching for report
        )

        if not entries:
            raise HTTPException(status_code=404, detail="No cost data found for the selected criteria to generate a report.")

        # 2. Generate file (can be run in background if very large)
        # For now, direct call. For very large reports, background_tasks.add_task is good.
        file_path = await generate_cost_report_file(
            subscription_id=subscription_id,
            cost_data_entries=entries,
            timeframe_str=timeframe,
            granularity_str=granularity,
            file_format=file_format
        )
        file_name = os.path.basename(file_path)

        # Construct download URL
        # Note: This assumes the /download-report/{file_name} route is correctly set up
        # and that the API is accessible at request.base_url
        download_url = f"{request.base_url}api/v1/cost/download-report/{file_name}"

        return ReportCreationResponse(
            message=f"{file_format.upper()} report generated successfully.",
            file_name=file_name,
            download_url=download_url
        )
    except HTTPException:
        raise
    except IOError as e: # Catch file generation errors
        logger.warning(f"File I/O error generating report for {subscription_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate report file: {str(e)}")
    except Exception as e:
        logger.warning(f"API Error generating report for {subscription_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred while generating the report: {str(e)}")

@router.get("/subscriptions/{subscription_id}/available-tags", response_model=List[TagDetailsResponse])
async def get_available_tags(
    subscription_id: str,
    token: str = Security(oauth2_scheme)
):
    """
    Retrieves a list of tag names and their values available within the specified subscription.
    """
    try:
        logger.info(f"Fetching available tags for subscription: {subscription_id}")
        tags = await list_available_tags_for_subscription(access_token=token, subscription_id=subscription_id)
        logger.info(f"Successfully fetched {len(tags)} tag details for subscription: {subscription_id}")
        return tags
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"API Error fetching available tags for {subscription_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred while fetching available tags: {str(e)}")

@router.get("/download-report/{file_name}")
async def download_generated_report(file_name: str):
    """
    Allows downloading a previously generated report file.
    Ensure file_name is sanitized or validated to prevent directory traversal.
    """
    # Basic sanitization: ensure filename doesn't try to access parent directories
    if ".." in file_name or file_name.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid file name.")

    file_path = os.path.join(GENERATED_REPORTS_DIR, file_name)
    logger.info(f"Attempting to serve file: {file_path}")

    if not os.path.exists(file_path) or not os.path.isfile(file_path): # Check if it's actually a file
        logger.warning(f"Report file not found: {file_path}")
        raise HTTPException(status_code=404, detail="Report file not found or has been cleaned up.")

    # Determine media type based on extension
    media_type = "application/octet-stream" # Default
    if file_name.lower().endswith(".csv"):
        media_type = "text/csv"
    elif file_name.lower().endswith(".xlsx"):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return FileResponse(path=file_path, filename=file_name, media_type=media_type)