import { PublicClientApplication, Configuration, RedirectRequest } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { AuthCodeMSALBrowserAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/authCodeMsalBrowser";

// MSAL configuration
const rawTenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const rawClientId = import.meta.env.VITE_AZURE_CLIENT_ID;

// Explicitly handle empty or "undefined" string literal
const tenantId = (!rawTenantId || rawTenantId === 'undefined' || rawTenantId === '') ? 'common' : rawTenantId;
const clientId = (!rawClientId || rawClientId === 'undefined' || rawClientId === '') ? '' : rawClientId;

if (tenantId === 'common' || !clientId) {
    console.warn("Microsoft Graph Configuration Warning:", {
        tenantId,
        clientId: clientId ? "Omitted for security" : "MISSING",
        rawTenantId,
        rawClientId
    });
    console.error("VITE_AZURE_TENANT_ID or VITE_AZURE_CLIENT_ID appears to be unset. Fallback to 'common' might cause issues for single-tenant apps.");
}

export const msalConfig: Configuration = {
    auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin,
    },
    cache: {
        cacheLocation: "localStorage",
    },
};

console.log("MSAL initialized with authority:", msalConfig.auth.authority);

// Scopes for API permissions
export const loginRequest: RedirectRequest = {
    scopes: ["User.Read", "Files.ReadWrite"],
};

// Initialize MSAL instance (v3+)
export const msalInstance = new PublicClientApplication(msalConfig);

let msalInitPromise: Promise<void> | null = null;

export const ensureMsalInitialized = async () => {
    if (msalInitPromise) return msalInitPromise;

    msalInitPromise = (async () => {
        await msalInstance.initialize();
        try {
            const result = await msalInstance.handleRedirectPromise();
            if (result) {
                msalInstance.setActiveAccount(result.account);
            }
        } catch (error) {
            console.warn("MSAL handleRedirectPromise error (non-fatal):", error);
            // Ignore no_token_request_cache_error as it just means no redirect happened or cache was lost
        }
    })();

    return msalInitPromise;
};

// Start initialization immediately
ensureMsalInitialized().catch(console.error);

// Initialize MSAL provider only once it's needed
let graphClient: Client | null = null;

export const getGraphClient = async (): Promise<Client> => {
    if (graphClient) return graphClient;

    // Ensure an account is signed in
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
        // If not signed in, we need to trigger login (handled in the hook usually)
        throw new Error("No Microsoft account signed in");
    }

    // Set the active account
    msalInstance.setActiveAccount(accounts[0]);

    // Create authentication provider
    const authProvider = new AuthCodeMSALBrowserAuthenticationProvider(msalInstance as any, {
        account: accounts[0],
        scopes: loginRequest.scopes,
        interactionType: "redirect" as any,
    });

    graphClient = Client.initWithMiddleware({ authProvider });
    return graphClient;
};
