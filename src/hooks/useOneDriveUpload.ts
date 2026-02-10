import { useState, useCallback } from 'react';
import { msalInstance, getGraphClient, initializeMsal, signIn } from '../lib/microsoftGraph';
import { Attachment } from './useFileUpload';

export function useOneDriveUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // 初期化チェック
    useState(() => {
        const init = async () => {
            try {
                await initializeMsal();
                const account = msalInstance.getActiveAccount();
                setIsAuthenticated(!!account);
            } catch (e) {
                console.error("OneDrive init check failed:", e);
            }
        };
        init();
    });

    // ログイン状態確認
    const checkLoginStatus = useCallback(async () => {
        await initializeMsal();
        const account = msalInstance.getActiveAccount();
        const isAuth = !!account;
        setIsAuthenticated(isAuth);
        return isAuth;
    }, []);

    // ログイン処理
    const login = async (promptType: "select_account" | "consent" = "select_account") => {
        try {
            setStatusMessage(promptType === "consent" ? '権限の承認が必要です...' : 'Microsoft アカウントにログイン中...');
            const account = await signIn(promptType);
            if (account) {
                setIsAuthenticated(true);
            }
            return account;
        } catch (error: any) {
            console.error("Microsoft login failed:", error);
            if (error.message && !error.message.includes("ポップアップ")) {
                // ポップアップブロッカー以外のエラー
            }
            return null;
        } finally {
            setStatusMessage('');
        }
    };

    const uploadFile = async (file: File): Promise<Attachment | null> => {
        setUploading(true);
        setStatusMessage('準備中...');

        try {
            // 1. クライアント取得確認
            let client;
            try {
                client = await getGraphClient();
            } catch (authError: any) {
                console.warn("Auth check failed, attempting login...", authError);
                // Check for interaction required OR consent required (invalid_grant)
                if (
                    authError.message?.includes("InteractionRequired") ||
                    authError.message?.includes("ui_required") ||
                    authError.message?.includes("invalid_grant") ||
                    authError.message?.includes("AADSTS65001") ||
                    JSON.stringify(authError).includes("AADSTS65001")
                ) {
                    const account = await login();
                    if (!account) {
                        throw new Error("LoginRequired");
                    }
                    client = await getGraphClient();
                } else {
                    throw authError;
                }
            }

            // Helper to execute with retry on auth error
            const executeWithRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
                try {
                    return await operation();
                } catch (error: any) {
                    const errorString = JSON.stringify(error);
                    if (
                        errorString.includes("invalid_grant") ||
                        errorString.includes("AADSTS65001") ||
                        errorString.includes("AADSTS65002") || /* Consent required */
                        error.code === "InvalidAuthenticationToken"
                    ) {
                        console.warn("Auth/Consent error during operation, retrying with force consent...", error);
                        // Force consent prompt
                        const account = await login("consent");
                        if (account) {
                            // Refresh client after login just in case
                            client = await getGraphClient();
                            return await operation();
                        }
                    }
                    throw error;
                }
            };

            setStatusMessage('フォルダ確認中...');

            // 2. フォルダの確認と作成
            const folderName = "TeamsTaskManager_Attachments";

            // Helper to get-or-create folder by path robustly using Path-Based Addressing
            const getOrCreateFolder = async (client: any, targetFolderName: string) => {
                try {
                    // Try to get folder by path directly
                    // This avoids OData filter issues (400) and AppFolder issues
                    try {
                        const response = await client.api(`/me/drive/root:/${targetFolderName}`).get();
                        return response.id;
                    } catch (getError: any) {
                        if (getError.statusCode === 404) {
                            // Not found, create it
                            console.log(`Creating folder: ${targetFolderName} in root`);
                            const newFolder = await client.api('/me/drive/root/children').post({
                                name: targetFolderName,
                                folder: {},
                                "@microsoft.graph.conflictBehavior": "rename"
                            });
                            return newFolder.id;
                        } else {
                            throw getError;
                        }
                    }
                } catch (e: any) {
                    console.error('Folder creation error:', e);
                    if (e.code === "notSupported" || e.statusCode === 400) {
                        // Fallback: If root access fails, try standard Drive root access pattern for Business
                        console.warn("Root path failed, trying fallback creation...");
                        // Attempting creation without check might arguably be cleaner if GET failed with weird 400
                        // But if 400 is "Operation not supported", we might be in deep trouble.
                        // Let's try creating directly if GET 400'd in a way we couldn't handle, implies we can't READ?
                        // Re-throwing specific friendly error.
                        throw new Error("OneDriveへの接続に問題があります。個人のOneDriveがセットアップされているか、または組織のポリシーを確認してください (Status: " + e.statusCode + ")");
                    }
                    throw e;
                }
            };

            // Execute folder creation with retry
            const folderId = await executeWithRetry(() => getOrCreateFolder(client, folderName));

            setStatusMessage('アップロード中...');

            // 3. ファイルアップロード
            const cleanName = file.name.replace(/[:\\/*?"<>|]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;

            const performUpload = async () => {
                const uploadSession = await client.api(`/me/drive/items/${folderId}:/${fileName}:/createUploadSession`).post({
                    item: {
                        "@microsoft.graph.conflictBehavior": "rename",
                        name: fileName
                    }
                });

                const uploadUrl = uploadSession.uploadUrl;
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Range': `bytes 0-${file.size - 1}/${file.size}`
                    }
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Upload failed: ${response.status} ${errText}`);
                }

                return await response.json();
            };

            const driveItem = await executeWithRetry(performUpload);
            const resultItemId = driveItem.id;

            setStatusMessage('リンクを取得中...');

            // 5. 共有リンク作成
            // 組織内リンクを優先、失敗したら既存のwebUrl
            let webUrl = driveItem.webUrl;
            try {
                const linkResponse = await client.api(`/me/drive/items/${resultItemId}/createLink`).post({
                    type: "view",
                    scope: "organization"
                });
                webUrl = linkResponse.link.webUrl;
            } catch (linkError) {
                console.warn("Organization link creation failed, using webUrl", linkError);
            }

            // 6. サムネイル取得 (画像ファイルの場合)
            let thumbnailUrl = '';
            if (file.type.startsWith('image/')) {
                try {
                    const thumbResponse = await client.api(`/me/drive/items/${resultItemId}/thumbnails`).select('large').get();
                    if (thumbResponse.value && thumbResponse.value.length > 0) {
                        thumbnailUrl = thumbResponse.value[0].large?.url || '';
                    }
                } catch (thumbError) {
                    console.warn("Thumbnail fetch failed", thumbError);
                }
            }

            const newAttachment: Attachment = {
                id: resultItemId,
                url: webUrl, // Fixed property name from path to url
                name: file.name,
                type: file.type,
                size: file.size,
                thumbnailUrl: thumbnailUrl,
                storageProvider: 'onedrive'
            };

            setAttachments(prev => [...prev, newAttachment]);
            return newAttachment;

        } catch (error: any) {
            console.error("OneDrive upload error:", error);
            if (error.message === "LoginRequired") {
                return null;
            }
            alert(`アップロードに失敗しました。\n${error.message || error}`);
            return null; // Return null handled by caller
        } finally {
            setUploading(false);
            setStatusMessage('');
        }
    };

    const removeFile = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const clearFiles = () => {
        setAttachments([]);
    };

    const downloadFileFromOneDrive = async (fileId: string, fileName: string) => {
        try {
            let client;
            try {
                client = await getGraphClient();
            } catch (e) {
                const account = await login();
                if (!account) return;
                client = await getGraphClient();
            }

            const response = await client.api(`/me/drive/items/${fileId}`)
                .select('@microsoft.graph.downloadUrl')
                .get();

            const downloadUrl = response["@microsoft.graph.downloadUrl"];

            if (downloadUrl) {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = fileName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                throw new Error("Download URL not found");
            }
        } catch (error: any) {
            console.error("Download failed:", error);
            alert(`ダウンロードに失敗しました: ${error.message || error}`);
        }
    };

    return {
        uploadFile,
        uploading,
        statusMessage,
        attachments,
        setAttachments,
        isAuthenticated,
        login,
        checkLoginStatus,
        removeFile,
        clearFiles,
        downloadFileFromOneDrive
    };
}
