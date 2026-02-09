import { PublicClientApplication, Configuration, InteractionRequiredAuthError } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";

// --- Configuration ---
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || 'common';
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || '';
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || (window.location.origin + import.meta.env.BASE_URL).replace(/\/$/, "") + (import.meta.env.BASE_URL === '/' ? '' : '/');
// Robust fallback: 
// 1. Env var defined? Use it.
// 2. Else construct from Origin + Base.
// Note: Azure settings often have inconsistent trailing slashes. 
// Local: http://localhost:5173 (no slash)
// Prod: .../Contact-Team-Manager/ (with slash)
// The logic above attempts to handle this, but for absolute safety:
// If base is '/', we strip slash -> origin.
// If base is '/foo/', we keep slash -> origin/foo/


if (!clientId) {
    console.warn("Microsoft Graph: Client ID is missing. Please check your .env file.");
}

export const msalConfig: Configuration = {
    auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: redirectUri,
    },
    cache: {
        cacheLocation: "localStorage",
        // storeAuthStateInCookie: false, // Removed to fix lint type error
    },
};

// Scopes
export const loginRequest = {
    scopes: ["User.Read", "Files.ReadWrite"],
};

// --- Singleton Instance ---
export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize usually happens in main/App, but we can expose a helper if needed.
// However, MSAL v2 is async init.
// Initialize usually happens in main/App, but we can expose a helper if needed.
// However, MSAL v2 is async init.
let initPromise: Promise<void> | null = null;

export const initializeMsal = async () => {
    if (!initPromise) {
        initPromise = (async () => {
            await msalInstance.initialize();

            // Check if we returned from a redirect
            try {
                await msalInstance.handleRedirectPromise();
            } catch (e) {
                console.error("MSAL Redirect Handle Error:", e);
            }

            // Restore account from cache if available
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
                msalInstance.setActiveAccount(accounts[0]);
            }
        })();
    }
    await initPromise;
};

// --- Auth Helpers ---

/**
 * Sign in using Popup. 
 */
export const signIn = async () => {
    await initializeMsal();
    try {
        const result = await msalInstance.loginPopup({
            ...loginRequest,
            prompt: "select_account"
        });
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch (error) {
        console.error("Login Failed:", error);
        throw error;
    }
};

/**
 * Sign out
 */
export const signOut = async () => {
    await initializeMsal();
    // Use popup logout or redirect logout
    const account = msalInstance.getActiveAccount();
    if (account) {
        await msalInstance.logoutPopup({
            postLogoutRedirectUri: window.location.origin
        });
    }
};

/**
 * Get Access Token silently. Returns null if interaction required.
 */
export const getToken = async (): Promise<string | null> => {
    await initializeMsal();
    const account = msalInstance.getActiveAccount();
    if (!account) return null;

    try {
        const response = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account: account
        });
        return response.accessToken;
    } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
            return null; // Interaction needed
        }
        console.error("GetToken Error:", error);
        return null;
    }
};

/**
 * Get Authenticated Microsoft Graph Client
 */
export const getGraphClient = async (): Promise<Client> => {
    await initializeMsal();
    const token = await getToken();

    if (!token) {
        throw new Error("InteractionRequired");
        // Caller should catch this and call signIn()
    }

    return Client.init({
        authProvider: (done) => {
            done(null, token);
        }
    });
};
