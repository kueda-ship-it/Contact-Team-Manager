import type { Configuration, RedirectRequest } from "@azure/msal-browser";

export const msalConfig: Configuration = {
    auth: {
        clientId: "YOUR_CLIENT_ID_HERE", // Azure Portal で取得したクライアントIDをご入力ください
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "sessionStorage",
    },
};

export const loginRequest: RedirectRequest = {
    scopes: ["User.Read", "Chat.Read", "Chat.ReadWrite"]
};

export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
    graphChatEndpoint: "https://graph.microsoft.com/v1.0/me/chats",
};
