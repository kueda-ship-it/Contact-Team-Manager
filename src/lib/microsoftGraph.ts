import { PublicClientApplication, Configuration, LogLevel, AccountInfo } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { AuthCodeMSALBrowserAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/authCodeMsalBrowser";

// 1. 環境変数の取得と検証
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID?.trim();
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID?.trim();
const redirectUri = window.location.origin + import.meta.env.BASE_URL;

if (!clientId || !tenantId) {
    console.error("Azure Client ID or Tenant ID is missing in .env");
}

console.log(`[MSAL Config] ClientID=${clientId}, TenantID=${tenantId}, RedirectURI=${redirectUri}`);

// 2. MSAL設定
const msalConfig: Configuration = {
    auth: {
        clientId: clientId || "",
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: redirectUri,
        navigateToLoginRequestUrl: false,
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) return;
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                    case LogLevel.Info:
                        // console.info(message);
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                }
            },
            logLevel: LogLevel.Verbose,
        }
    }
};

// スコープ定義 (標準的な読み書き権限)
export const loginRequest = {
    scopes: ["User.Read", "Files.ReadWrite"]
};

// MSALインスタンス作成
export const msalInstance = new PublicClientApplication(msalConfig);

// 初期化フラグ
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// MSAL初期化関数
export const initializeMsal = async () => {
    if (isInitialized) return;

    if (!initPromise) {
        initPromise = (async () => {
            await msalInstance.initialize();

            // リダイレクトからの復帰を処理
            try {
                const response = await msalInstance.handleRedirectPromise();
                if (response) {
                    console.log("Redirect Login Success:", response);
                    msalInstance.setActiveAccount(response.account);
                }
            } catch (error) {
                console.error("Redirect Handle Error:", error);
            }

            // アカウントの復元
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
                msalInstance.setActiveAccount(accounts[0]);
            }

            isInitialized = true;
        })();
    }

    await initPromise;
};

// サインイン関数
let isLoggingIn = false;
export const signIn = async (promptType: "select_account" | "consent" = "select_account"): Promise<AccountInfo | null> => {
    if (isLoggingIn) {
        console.warn("Login already in progress, ignoring duplicate request.");
        return null;
    }

    await initializeMsal();

    const activeAccount = msalInstance.getActiveAccount();
    // If we are forcing consent, we ignore the active account check and proceed to interactive login
    if (activeAccount && promptType !== "consent") {
        return activeAccount;
    }

    try {
        isLoggingIn = true;
        console.log(`Attempting Popup Login with prompt: ${promptType}...`);
        const result = await msalInstance.loginPopup({
            ...loginRequest,
            prompt: promptType
        });
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch (error: any) {
        if (error.errorCode !== "interaction_in_progress") {
            console.warn("Popup Login failed, attempting Redirect...", error);
            // ポップアップが失敗した場合はリダイレクトで試行
            try {
                await msalInstance.loginRedirect({
                    ...loginRequest,
                    prompt: promptType
                });
                return null;
            } catch (redirectError) {
                console.error("Redirect Login failed:", redirectError);
                throw redirectError;
            }
        }
        return null;
    } finally {
        isLoggingIn = false;
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

// Graphクライアントの取得
export const getGraphClient = async () => {
    await initializeMsal();

    const account = msalInstance.getActiveAccount();
    if (!account) {
        throw new Error("User not signed in");
    }

    const authProvider = new AuthCodeMSALBrowserAuthenticationProvider(msalInstance, {
        account: account,
        scopes: loginRequest.scopes,
        interactionType: 0, // InteractionType.Redirect
    });

    return Client.initWithMiddleware({
        authProvider,
    });
};
