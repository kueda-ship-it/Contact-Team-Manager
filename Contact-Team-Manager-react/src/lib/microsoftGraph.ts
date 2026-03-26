import { PublicClientApplication, Configuration, LogLevel, AccountInfo, InteractionRequiredAuthError, InteractionType } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { AuthCodeMSALBrowserAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/authCodeMsalBrowser";

// 1. 環境変数の取得と検証
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID?.trim();
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID?.trim();
// .env の値を優先し、なければ動的に生成（末尾の / 修飾を避けるため trim 等で調整）
const envRedirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI?.trim();
const redirectUri = envRedirectUri || (window.location.origin + (import.meta.env.BASE_URL || ""));

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
    },
    cache: {
        cacheLocation: "localStorage",
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

// メール関連の型定義
export interface MailFolder {
    id: string;
    displayName: string;
    totalItemCount: number;
    unreadItemCount: number;
}

export interface MailMessage {
    id: string;
    subject: string;
    bodyPreview: string;
    receivedDateTime: string;
    from: {
        emailAddress: {
            name: string;
            address: string;
        };
    };
    flag: {
        flagStatus: 'notFlagged' | 'flagged' | 'complete';
        dueDateTime?: { dateTime: string; timeZone: string };
        startDateTime?: { dateTime: string; timeZone: string };
    };
}

// 外部トークン（Supabase SSO から取得したもの）の保持
let externalAccessToken: string | null = null;
export const setExternalAccessToken = (token: string | null) => {
    externalAccessToken = token;
    if (token) {
        console.log("[MSAL] External access token updated.");
        window.dispatchEvent(new CustomEvent('externalTokenUpdated'));
    }
};
export const hasExternalAccessToken = () => !!externalAccessToken;

// Supabase SSO ユーザーのメールアドレス（loginHint として使用）
let externalUserEmail: string | null = null;
export const setExternalUserEmail = (email: string) => { externalUserEmail = email; };

// メール専用スコープ
const MAIL_SCOPES = ['Mail.Read'];

/**
 * Mail.Read トークンを取得する。
 *
 * ポイント：組織テナントで「管理者承認が必要」画面を出さないために
 *   - loginPopup（フルログイン画面）は使わない
 *   - acquireTokenPopup + loginHint でスコープ追加の同意だけを求める
 *   - これにより「このアプリが Mail.Read を求めています」という小さな同意画面だけ表示される
 */
export const acquireMailToken = async (interactive = false): Promise<string> => {
    await initializeMsal();

    const account = msalInstance.getActiveAccount();

    // ① MSAL アカウントあり → サイレント取得を試みる
    if (account) {
        try {
            const response = await msalInstance.acquireTokenSilent({ scopes: MAIL_SCOPES, account });
            return response.accessToken;
        } catch (err) {
            if (!(err instanceof InteractionRequiredAuthError)) throw err;
            if (!interactive) throw err;
            // サイレント失敗 → acquireTokenPopup（既存アカウントへのスコープ追加同意）
            const response = await msalInstance.acquireTokenPopup({ scopes: MAIL_SCOPES, account });
            return response.accessToken;
        }
    }

    // ② MSAL アカウントなし（Supabase SSO 経由でログイン中）
    if (!interactive) throw new InteractionRequiredAuthError('no_account');

    // loginHint にユーザーのメールアドレスを渡すことで：
    //   - 既存の Microsoft ブラウザセッションを使って自動認証
    //   - 同意が必要な場合も「スコープ追加の同意」画面のみ表示（フルログイン画面にならない）
    //   - 組織テナントの管理者承認フローが発動しない
    const loginHint = externalUserEmail ?? undefined;
    const response = await msalInstance.acquireTokenPopup({ scopes: MAIL_SCOPES, loginHint });
    msalInstance.setActiveAccount(response.account);
    return response.accessToken;
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
                const response = await msalInstance.handleRedirectPromise({
                    navigateToLoginRequestUrl: false // MSALによる自動リダイレクトを抑制
                });
                if (response) {
                    console.log("Redirect Login Success:", response);
                    msalInstance.setActiveAccount(response.account);
                }
            } catch (error: any) {
                // Supabase hash or other non-MSAL hash can trigger this. Safe to ignore.
                if (error.errorCode === "no_token_request_cache_error" || error.message?.includes("no_token_request_cache_error")) {
                    console.debug("Non-MSAL redirect detected (or cache lost):", error);
                } else {
                    console.error("Redirect Handle Error:", error);
                }
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
// ※ prompt:'consent' は組織テナントで「管理者承認が必要」画面を誘発するため使用しない
let isLoggingIn = false;
export const signIn = async (): Promise<AccountInfo | null> => {
    if (isLoggingIn) {
        console.warn("Login already in progress, ignoring duplicate request.");
        return null;
    }

    isLoggingIn = true;

    try {
        await initializeMsal();

        const activeAccount = msalInstance.getActiveAccount();
        if (activeAccount) {
            return activeAccount;
        }

        console.log('Attempting Popup Login...');

        // prompt を指定しない → Azure AD が最適な同意フローを選ぶ（管理者承認フロー強制なし）
        const result = await msalInstance.loginPopup({ ...loginRequest });
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch (error: any) {
        if (error.errorCode === "block_nested_popups") {
             console.warn("Popup blocked (nested). Fallback to redirect may be needed via user action.");
             throw new Error("ポップアップがブロックされました。ブラウザの設定で許可するか、もう一度クリックしてください。");
        }
        if (error.errorCode !== "interaction_in_progress") {
            console.warn("Popup Login failed, attempting Redirect...", error);
            try {
                await msalInstance.loginRedirect({ ...loginRequest });
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
 * SSO Silent Login using Email Hint
 */
export const ssoLogin = async (email: string): Promise<AccountInfo | null> => {
    if (!email) return null;

    await initializeMsal();

    // Check if we are already logged in with this email
    const activeAccount = msalInstance.getActiveAccount();
    if (activeAccount && activeAccount.username.toLowerCase() === email.toLowerCase()) {
        console.log("[MSAL] Already logged in as", email);
        return activeAccount;
    }

    try {
        console.log(`[MSAL] Attempting Silent SSO for ${email}...`);

        // Try to find an existing account in cache first
        const accounts = msalInstance.getAllAccounts();
        const existingAccount = accounts.find(a => a.username.toLowerCase() === email.toLowerCase());

        if (existingAccount) {
            msalInstance.setActiveAccount(existingAccount);
            return existingAccount;
        }

        // If not found, try ssoSilent
        const result = await msalInstance.ssoSilent({
            ...loginRequest,
            loginHint: email
        });

        console.log("[MSAL] Silent SSO Success:", result);
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch (error) {
        console.warn("[MSAL] Silent SSO Failed:", error);
        // Fallback or just stay logged out (user will click attachment button later)
        return null;
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
 * 受信トレイのサブフォルダ一覧を取得
 */
export const getInboxSubfolders = async (): Promise<MailFolder[]> => {
    const client = await getGraphClient(loginRequest.scopes);
    const response = await client
        .api('/me/mailFolders/Inbox/childFolders')
        .top(100)
        .select('id,displayName,totalItemCount,unreadItemCount')
        .get();
    return response.value || [];
};

/**
 * 指定フォルダの新着メッセージを取得 (since 以降)
 */
export const getNewMessagesInFolder = async (
    folderId: string,
    since: string
): Promise<MailMessage[]> => {
    const client = await getGraphClient(loginRequest.scopes);
    // OData filter は ミリ秒なしの形式が必要
    const sinceFormatted = since.replace(/\.\d{3}Z$/, 'Z');
    const response = await client
        .api(`/me/mailFolders/${folderId}/messages`)
        .filter(`receivedDateTime gt ${sinceFormatted}`)
        .select('id,subject,bodyPreview,receivedDateTime,from,flag')
        .orderby('receivedDateTime asc')
        .top(50)
        .get();
    return response.value || [];
};

// Graphクライアントの取得
export const getGraphClient = async (scopes: string[] = loginRequest.scopes) => {
    // 外部トークン（Supabase SSO経由）が利用可能な場合はそれを使用する
    if (externalAccessToken) {
        // console.log("[MSAL] Using external access token from Supabase.");
        return Client.init({
            authProvider: (done) => {
                done(null, externalAccessToken!);
            }
        });
    }

    await initializeMsal();

    const account = msalInstance.getActiveAccount();
    if (!account) {
        throw new Error("User not signed in");
    }

    const authProvider = new AuthCodeMSALBrowserAuthenticationProvider(msalInstance, {
        account: account,
        scopes: scopes,
        interactionType: InteractionType.Popup,
    });

    return Client.initWithMiddleware({
        authProvider,
    });
};


