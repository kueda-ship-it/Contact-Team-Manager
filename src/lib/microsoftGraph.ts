import { PublicClientApplication, Configuration, InteractionRequiredAuthError } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";

// MSAL configuration
const rawTenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const rawClientId = import.meta.env.VITE_AZURE_CLIENT_ID;

const tenantId = (!rawTenantId || rawTenantId === 'undefined' || rawTenantId === '') ? 'common' : rawTenantId;
const clientId = (!rawClientId || rawClientId === 'undefined' || rawClientId === '') ? '' : rawClientId;

if (tenantId === 'common' || !clientId) {
    console.warn("Microsoft Graph Configuration Warning:", { tenantId, clientId: clientId ? "Configured" : "MISSING" });
}

const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin;

export const msalConfig: Configuration = {
    auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        redirectUri: redirectUri,
    },
    cache: {
        cacheLocation: "localStorage", // Needed for persistent login across refreshes
    },
};

// Scopes for API permissions
export const loginRequest = {
    scopes: ["User.Read", "Files.ReadWrite"],
};

export const msalInstance = new PublicClientApplication(msalConfig);

let msalInitPromise: Promise<void> | null = null;
let loginPromise: Promise<any> | null = null;

export const ensureMsalInitialized = async () => {
    if (msalInitPromise) return msalInitPromise;

    msalInitPromise = (async () => {
        try {
            await msalInstance.initialize();

            // Handle redirect results (critical for redirect flow, good practice for popup too)
            const result = await msalInstance.handleRedirectPromise();
            if (result) {
                console.log("MSAL: Redirect result processing...", result.account.username);
                msalInstance.setActiveAccount(result.account);
            } else {
                // If no redirect, restore from cache
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    console.log("MSAL: Account restored from cache", accounts[0].username);
                    msalInstance.setActiveAccount(accounts[0]);
                }
            }
        } catch (error) {
            console.error("MSAL initialization failed:", error);
        }
    })();

    return msalInitPromise;
};

// Ensure init starts immediately
ensureMsalInitialized().catch(console.error);

/**
 * Attempts to get an access token silently.
 * If interaction is required, it returns null (does NOT prompt).
 */
export const getToken = async (): Promise<string | null> => {
    await ensureMsalInitialized();
    const account = msalInstance.getActiveAccount();

    if (!account) return null;

    try {
        const response = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account: account,
        });
        return response.accessToken;
    } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
            console.warn("Silent token acquisition failed, interaction required.", error);
            return null;
        }
        console.error("Token acquisition error:", error);
        return null;
    }
};

/**
 * Initiates an interactive login (popup).
 */
export const login = async () => {
    if (loginPromise) return loginPromise;

    loginPromise = (async () => {
        try {
            await ensureMsalInitialized();

            // Double check if we really need to login
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                msalInstance.setActiveAccount(accounts[0]);
                return accounts[0];
            }

            const result = await msalInstance.loginPopup({
                ...loginRequest,
                prompt: "select_account"
            });
            msalInstance.setActiveAccount(result.account);
            return result.account;
        } catch (error: any) {
            console.error("Login failed:", error);
            if (error.errorCode === "popup_window_error" || error.message?.includes("popup")) {
                throw new Error("ポップアップがブロックされました。");
            }
            throw error;
        } finally {
            loginPromise = null;
        }
    })();

    return loginPromise;
};

// Custom Authentication Provider to ensure we use our token logic
class CustomAuthProvider {
    public async getAccessToken(): Promise<string> {
        // Try silent first
        let token = await getToken();
        if (!token) {
            // If silent fails, we need to prompt.
            // However, the Graph Client might be calling this internally.
            // If we are in a context where we can't prompt (e.g. background), this will fail.
            // But for this app, actions are user-initiated.
            // For now, if silent fails, we throw to let the caller handle the login prompt
            // OR we could try to login here if we are sure it won't be blocked.
            // Safest: Throw, and let useOneDriveUpload catch and call login().
            throw new Error("InteractionRequired");
        }
        return token;
    }
}

/**
 * Returns an authenticated Graph Client.
 * Will throw if no user is signed in.
 */
export const getGraphClient = async (): Promise<Client> => {
    // Ensure initialized
    await ensureMsalInitialized();

    // Check if we have an active account *or* can get one from cache
    let account = msalInstance.getActiveAccount();
    if (!account) {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            account = accounts[0];
        }
    }

    if (!account) {
        throw new Error("Microsoft アカウントにサインインしていません。");
    }

    // Use our custom provider that calls getToken()
    const authProvider = new CustomAuthProvider();

    return Client.initWithMiddleware({ authProvider });
};

export const logout = async () => {
    await ensureMsalInitialized();
    const account = msalInstance.getActiveAccount();
    if (account) {
        await msalInstance.logoutPopup({
            account,
            postLogoutRedirectUri: window.location.origin
        });
    }
};
