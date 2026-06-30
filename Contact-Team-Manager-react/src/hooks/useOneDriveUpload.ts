import { useState, useCallback, useEffect } from 'react';
import { msalInstance, getGraphClient, initializeMsal, signIn, hasExternalAccessToken, encodeShareUrl } from '../lib/microsoftGraph';
import { EventType } from "@azure/msal-browser";
import { Attachment } from './useFileUpload';

interface ItemRef { id?: string; driveId?: string; shareUrl?: string }

// 共有リンク優先でドライブアイテムへアクセスするためのベースパスを返す。
// 他ユーザーがアップロードしたファイルは /drives/{driveId} 直アクセスだと 403 になるため、
// 組織共有リンク (att.url) があれば /shares/{enc}/driveItem を使う。
const buildItemBase = (ref: ItemRef): { base: string; isShare: boolean }[] => {
    const paths: { base: string; isShare: boolean }[] = [];
    if (ref.shareUrl) {
        paths.push({ base: `/shares/${encodeShareUrl(ref.shareUrl)}/driveItem`, isShare: true });
    }
    if (ref.id) {
        paths.push({ base: ref.driveId ? `/drives/${ref.driveId}/items/${ref.id}` : `/me/drive/items/${ref.id}`, isShare: false });
    }
    return paths;
};

// メタ（downloadUrl 等）を共有リンク優先＋driveId フォールバックで取得
const fetchDriveItem = async (client: any, ref: ItemRef, select = 'id,name,file,@microsoft.graph.downloadUrl') => {
    const candidates = buildItemBase(ref);
    if (candidates.length === 0) throw new Error('No item reference');
    let lastError: any;
    for (const { base } of candidates) {
        try {
            return await client.api(base).select(select).get();
        } catch (e) {
            lastError = e;
            console.warn(`[OneDrive] item fetch failed via ${base}, trying next...`, e);
        }
    }
    throw lastError;
};

export function useOneDriveUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<{ id: string, file: File, previewUrl: string }[]>([]);

    // 初期化 & イベントリスナー (SSO検知用)
    useEffect(() => {
        const checkAuth = async () => {
            await initializeMsal();
            const account = msalInstance.getActiveAccount();
            setIsAuthenticated(!!account || hasExternalAccessToken());
        };

        checkAuth();

        // 外部(ssoLogin等)でログイン完了した場合に検知してステータス更新
        const callbackId = msalInstance.addEventCallback((event: any) => {
            if (
                event.eventType === EventType.LOGIN_SUCCESS ||
                event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
                event.eventType === EventType.ACTIVE_ACCOUNT_CHANGED
            ) {
                const account = msalInstance.getActiveAccount();
                setIsAuthenticated(!!account || hasExternalAccessToken());
            }
        });

        // Supabase provider_token がセットされた場合に検知
        const handleExternalToken = () => setIsAuthenticated(true);
        window.addEventListener('externalTokenUpdated', handleExternalToken);

        return () => {
            if (callbackId) msalInstance.removeEventCallback(callbackId);
            window.removeEventListener('externalTokenUpdated', handleExternalToken);
        };
    }, []);

    // ログイン状態確認
    const checkLoginStatus = useCallback(async () => {
        await initializeMsal();
        const account = msalInstance.getActiveAccount();
        const isAuth = !!account || hasExternalAccessToken();
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
                // Also set this as active account forcefully if not set
                if (!msalInstance.getActiveAccount()) {
                    msalInstance.setActiveAccount(account);
                }
            }
            return account;
        } catch (error: any) {
            console.error("Microsoft login failed:", error);
            return null;
        } finally {
            setStatusMessage('');
        }
    };

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const uploadFile = async (file: File): Promise<Attachment | null> => {
        const pendingId = Math.random().toString(36).substring(7);
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
        
        setPendingFiles(prev => [...prev, { id: pendingId, file, previewUrl }]);
        setUploading(true);
        setStatusMessage('準備中...');

        try {
            // 1. クライアント取得確認
            let client: any;
            try {
                client = await getGraphClient();
            } catch (authError: any) {
                console.warn("Auth check failed in uploadFile", authError);
                // Don't auto-login here because this might be triggered from onPaste (async),
                // which would be blocked by popups.
                throw new Error("Microsoft連携の認証が必要です。");
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
            const driveId = driveItem.parentReference?.driveId;
            // Also get the direct download URL as it's guaranteed to be a direct image link initially
            const downloadUrlFallback = driveItem["@microsoft.graph.downloadUrl"];

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

            // 6. サムネイルと確実なダウンロードURLを再取得 (画像ファイルの場合)
            // アップロード直後の response には @microsoft.graph.downloadUrl が含まれない場合があるため
            let thumbnailUrl = '';
            let finalDownloadUrl = downloadUrlFallback || '';

            if (file.type.startsWith('image/')) {
                setStatusMessage('プレビューを生成中...');
                const itemPath = driveId ? `/drives/${driveId}/items/${resultItemId}` : `/me/drive/items/${resultItemId}`;
                for (let i = 0; i < 4; i++) {
                    try {
                        const itemResponse = await client.api(itemPath).select('id,@microsoft.graph.downloadUrl').get();
                        if (itemResponse["@microsoft.graph.downloadUrl"]) {
                            finalDownloadUrl = itemResponse["@microsoft.graph.downloadUrl"];
                        }

                        const thumbResponse = await client.api(`${itemPath}/thumbnails`).get();
                        if (thumbResponse.value && thumbResponse.value.length > 0) {
                            const thumb = thumbResponse.value[0];
                            // 解像度優先順位: c1600x1600 > large > medium
                            thumbnailUrl = thumb.c1600x1600?.url || thumb.large?.url || thumb.medium?.url || '';
                            if (thumbnailUrl && finalDownloadUrl) break;
                        }
                    } catch (thumbError) {
                        console.warn(`Metadata fetch attempt ${i + 1} failed`, thumbError);
                    }
                    if (i < 3) await wait(1000 + i * 500); 
                }
            }

            const newAttachment: Attachment = {
                id: resultItemId,
                url: webUrl,
                name: file.name,
                type: file.type,
                size: file.size,
                thumbnailUrl: thumbnailUrl,
                downloadUrl: finalDownloadUrl,
                driveId: driveId,
                storageProvider: 'onedrive'
            };

            setAttachments(prev => [...prev, newAttachment]);
            return newAttachment;

        } catch (error: any) {
            console.error("OneDrive upload error:", error);
            const errMsg = error.message || String(error);
            if (
                errMsg.toLowerCase().includes("user not signed in") || 
                errMsg.includes("InteractionRequired") ||
                errMsg.includes("ui_required")
            ) {
                // Ignore alert for auth errors, they are handled by login triggers
                return null;
            }
            alert(`アップロードに失敗しました。\n${errMsg}`);
            return null;
        } finally {
            setUploading(false);
            setStatusMessage('');
            // Remove from pending files after upload attempt (success or fail)
            // Note: Not revoking here to avoid breaking active previews in modals
            setPendingFiles(prev => prev.filter(p => p.id !== pendingId));
        }
    };

    const removeFile = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const clearFiles = () => {
        setAttachments([]);
    };

    const downloadFileFromOneDrive = async (fileId: string, fileName: string, driveId?: string, shareUrl?: string) => {
        try {
            let client;
            try {
                client = await getGraphClient();
            } catch (e) {
                const account = await login();
                if (!account) return;
                client = await getGraphClient();
            }

            const response = await fetchDriveItem(client, { id: fileId, driveId, shareUrl }, '@microsoft.graph.downloadUrl');

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

    const getFreshAttachmentMetadata = useCallback(async (fileId: string, driveId?: string, shareUrl?: string): Promise<{ thumbnailUrl: string, downloadUrl: string } | null> => {
        try {
            const client = await getGraphClient();

            // 共有リンク優先＋driveId フォールバックでベースパスを順に試す
            const candidates = buildItemBase({ id: fileId, driveId, shareUrl });
            let lastError: any;
            for (const { base } of candidates) {
                try {
                    const item = await client.api(base).select('id,name,@microsoft.graph.downloadUrl').get();
                    let thumbnailUrl = '';
                    try {
                        const thumbResponse = await client.api(`${base}/thumbnails`).select('large,c1600x1600').get();
                        if (thumbResponse.value && thumbResponse.value.length > 0) {
                            const thumb = thumbResponse.value[0];
                            thumbnailUrl = thumb.c1600x1600?.url || thumb.large?.url || '';
                        }
                    } catch (thumbErr) {
                        console.warn("[OneDrive] thumbnail fetch failed (non-critical)", thumbErr);
                    }
                    return {
                        thumbnailUrl,
                        downloadUrl: item["@microsoft.graph.downloadUrl"] || ''
                    };
                } catch (e) {
                    lastError = e;
                    console.warn(`[OneDrive] metadata fetch failed via ${base}, trying next...`, e);
                }
            }
            throw lastError || new Error('No item reference');
        } catch (error) {
            console.error("Failed to refresh attachment metadata:", error);
            return null;
        }
    }, []);

    // PDF 等をインラインプレビューするため、ファイル本体を取得して Blob の Object URL を返す。
    const getAttachmentBlobUrl = useCallback(async (att: any): Promise<string | null> => {
        try {
            let client;
            try {
                client = await getGraphClient();
            } catch (e) {
                const account = await login();
                if (!account) return null;
                client = await getGraphClient();
            }
            const item = await fetchDriveItem(client, { id: att.id, driveId: att.driveId, shareUrl: att.url });
            const downloadUrl = item["@microsoft.graph.downloadUrl"];
            if (!downloadUrl) throw new Error('ダウンロードURLが取得できませんでした');

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(downloadUrl, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`取得に失敗しました (${res.status})`);

            const raw = await res.blob();
            const typed = raw.type ? raw : new Blob([raw], { type: att.type || 'application/pdf' });
            return URL.createObjectURL(typed);
        } catch (error: any) {
            console.error("Failed to load attachment blob:", error);
            return null;
        }
    }, []);

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
        downloadFileFromOneDrive,
        getFreshAttachmentMetadata,
        getAttachmentBlobUrl,
        pendingFiles
    };
}
