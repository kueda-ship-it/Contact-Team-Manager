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
let loginPromise: Promise<any> | null = null;

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

export const login = async () => {
    // If a login is already in progress, return the existing promise
    if (loginPromise) return loginPromise;

    loginPromise = (async () => {
        try {
            await ensureMsalInitialized();

            // Check if we already have an account
            let account = msalInstance.getActiveAccount();
            if (!account) {
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    msalInstance.setActiveAccount(accounts[0]);
                    account = accounts[0];
                }
            }

            if (account) return account;

            // Trigger popup login
            const result = await msalInstance.loginPopup(loginRequest);
            if (result) {
                msalInstance.setActiveAccount(result.account);
                return result.account;
            }
            return null;
        } catch (error: any) {
            console.error("Microsoft login failed:", error);
            if (error.name === "BrowserAuthError" && error.errorCode === "popup_window_error") {
                throw new Error("ポップアップがブロックされたか、既にログイン画面が開いています。ブラウザの設定を確認してください。");
            }
            throw error;
        } finally {
            // Reset the promise so subsequent login attempts can retry if failed
            loginPromise = null;
        }
    })();

    return loginPromise;
};

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
        interactionType: "popup" as any,
    });

    graphClient = Client.initWithMiddleware({ authProvider });
    return graphClient;
};
