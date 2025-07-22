// src/utils/resourceIdParser.js

/**
 * Parses an Azure Resource ID into its constituent parts.
 * Example: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Sql/servers/{server}/databases/{db}
 * @param {string} resourceId The full Azure Resource ID.
 * @returns {object|null} An object with parsed parts or null if invalid.
 */
export const parseAzureResourceId = (resourceId) => {
    // console.log("[parseAzureResourceId] Input:", resourceId); // Debug input
    if (!resourceId || typeof resourceId !== 'string') {
        // console.log("[parseAzureResourceId] Invalid input typr or null.");
        return null;
    }

    const id = resourceId.toLowerCase(); // Work with lowercase for consistency

    const parts = id.split('/');
    if (parts[0] === '') parts.shift(); // Remove leading slash if present

    const parsed = {
        originalId: resourceId,
        subscriptionId: null,
        resourceGroupName: null,
        provider: null,         // e.g., microsoft.sql
        resourceType: [],       // e.g., ['servers'], ['sites', 'slots']
        resourceName: [],       // e.g., ['myservers'], ['myfunctionapp', 'myfunctionslot']
        get fullResourceType() { // Combined resource type path
            return this.resourceType.join('/');
        },
        get fullResourceName() { // Combined resource name path
            return this.resourceName.join('/');
        }
    };

    let i = 0;
    if (parts[i] === 'subscriptions' && parts.length > i + 1) {
        parsed.subscriptionId = parts[i + 1];
        i +=2;
    }

    if (parts[i] === 'resourcegroups' && parts.length > i + 1) {
        parsed.resourceGroupName = parts[i + 1];
        i +=2;
    }

    if (parts[i] === 'providers' && parts.length > i + 1) {
        parsed.provider = parts[i + 1];
        i +=2;

        // Resource types and names can be hierarchical (e.g., servers/myServer/databases/myDB)
        while (i < parts.length) {
            if (parts.length > i) { // Resource Type segment
                parsed.resourceType.push(parts[i]);
                i++;
            }
            if (parts.length > i) { // Resource Name segment
                parsed.resourceName.push(parts[i]);
                i++;
            } else { //Dangling type without a name, unlikely but break
                break;
            }
        }
    }

    // console.log("[parseAzureResourceId] Output:", parsed); // Debug output
    return parsed;
};