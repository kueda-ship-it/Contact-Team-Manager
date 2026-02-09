import { useState, useCallback } from 'react';
import { msalInstance, getGraphClient, initializeMsal, signIn } from '../lib/microsoftGraph';
import { Attachment } from './useFileUpload';

export function useOneDriveUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Initial check on mount
    useState(() => {
        // We use a self-executing async function or effect
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
        // Also listen for account changes if needed, but manual check is usually enough for this scope
    });

    // Check if logged in without prompting (helper)
    const checkLoginStatus = useCallback(async () => {
        await initializeMsal();
        const account = msalInstance.getActiveAccount();
        const isAuth = !!account;
        setIsAuthenticated(isAuth);
        return isAuth;
    }, []);

    // Perform Login
    const login = async () => {
        try {
            const account = await signIn();
            if (account) {
                setIsAuthenticated(true);
            }
            return account;
        } catch (error: any) {
            console.error("Microsoft login failed:", error);
            if (error.message && !error.message.includes("ポップアップ")) {
                alert(`Microsoft アカウントでのログインに失敗しました。\nエラー: ${error.message || error}`);
            }
            return null;
        }
    };

    const uploadFile = async (file: File): Promise<Attachment | null> => {
        setUploading(true);
        setStatusMessage('準備中...');

        try {
            try {
                // 1. Auth Check & Client
                client = await getGraphClient();
                // Test token validity immediately with a lightweight call
                await client.api('/me/drive').select('id').get();
            } catch (authError) {
                console.warn("Auth check failed:", authError);
                // DO NOT attempt interactive login here. It causes timeouts/popup issues during upload.
                // Reset auth state and prompt user to retry.
                setIsAuthenticated(false);
                throw new Error("InteractionRequired");
            }

            setStatusMessage('フォルダ確認中...');

            // 2. Ensure Target Folder Exists
            // Strategy: Use a flat simple folder structure to avoid complex traversal issues.
            // "Apps" folder can be problematic if not pre-provisioned. Using root folder for reliability.
            const targetFolderPath = "TeamsTaskManager_Attachments";

            // Helper to get-or-create folder by path robustly
            const getOrCreateFolder = async (client: any, path: string) => {
                const parts = path.split('/');
                let parentId = 'root'; // Start at root

                for (const part of parts) {
                    try {
                        // Check children of current parent
                        const response = await client.api(`/me/drive/items/${parentId}/children`)
                            .filter(`name eq '${part}' and folder ne null`)
                            .select('id')
                            .get();

                        if (response.value && response.value.length > 0) {
                            parentId = response.value[0].id;
                        } else {
                            // Does not exist, create it
                            console.log(`Creating folder: ${part} in ${parentId}`);
                            const newFolder = await client.api(`/me/drive/items/${parentId}/children`).post({
                                name: part,
                                folder: {},
                                "@microsoft.graph.conflictBehavior": "rename"
                            });
                            parentId = newFolder.id;
                        }
                    } catch (e: any) {
                        console.error(`Folder error for ${part}`, e);
                        throw new Error(`フォルダ「${part}」の作成に失敗しました: ${e.message}`);
                    }
                }
                return parentId;
            };

            const folderId = await getOrCreateFolder(client, targetFolderPath);

            // 3. Create Upload Session
            setStatusMessage('アップロード開始...');
            // Sanitize filename
            const cleanName = file.name.replace(/[:\\/*?"<>|]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;

            const uploadSession = await client
                .api(`/me/drive/items/${folderId}:/${fileName}:/createUploadSession`)
                .post({
                    item: {
                        "@microsoft.graph.conflictBehavior": "rename",
                        name: fileName
                    }
                });

            // 4. Upload byte stream
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
                throw new Error(`Upload fetch failed: ${response.status} ${response.statusText} - ${errText}`);
            }

            const driveItem = await response.json();
            console.log("Upload success, Item ID:", driveItem.id);

            // 5. Create Sharing Link
            setStatusMessage('リンク生成中...');
            let sharingUrl = driveItem.webUrl; // Default to direct link (requires auth) if sharing fails

            try {
                // Try Organization View Link first (most robust for internal teams)
                const linkRes = await client.api(`/me/drive/items/${driveItem.id}/createLink`).post({
                    type: "view",
                    scope: "organization"
                });
                sharingUrl = linkRes.link.webUrl;
            } catch (linkError) {
                console.warn("Organization link failed", linkError);
                // If org link fails, maybe try anonymous? or just keep webUrl
            }

            // 6. Thumbnails
            let thumbnailUrl = undefined;
            if (file.type.startsWith('image/')) {
                try {
                    const thumbRes = await client.api(`/me/drive/items/${driveItem.id}/thumbnails`).get();
                    if (thumbRes.value && thumbRes.value.length > 0) {
                        const t = thumbRes.value[0];
                        thumbnailUrl = t.large?.url || t.medium?.url || t.small?.url;
                    }
                } catch (e) { console.warn("No thumbnail", e); }
            }

            const newAttachment: Attachment = {
                id: driveItem.id,
                name: file.name,
                url: sharingUrl,
                thumbnailUrl: thumbnailUrl,
                type: file.type,
                size: file.size,
                storageProvider: 'onedrive'
            };

            setAttachments(prev => [...prev, newAttachment]);
            setStatusMessage('');
            return newAttachment;

        } catch (error: any) {
            console.error("OneDrive Upload Error:", error);

            // Helpful alerts
            if (error.message.includes("InteractionRequired") || error.message.includes("ui_required")) {
                alert("認証情報の更新が必要です。もう一度添付ボタンを押してサインインしてください。");
            } else {
                alert(`アップロードエラーが発生しました:\n${error.message || JSON.stringify(error)}`);
            }
            setStatusMessage('');
            return null;
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
            const client = await getGraphClient();
            const response = await client.api(`/me/drive/items/${fileId}`).select('@microsoft.graph.downloadUrl').get();
            const downloadUrl = response['@microsoft.graph.downloadUrl'];

            if (downloadUrl) {
                // Determine if we can force download or just open
                // For simplicity, opening in new tab usually triggers download for these URLs
                window.open(downloadUrl, '_blank');
            } else {
                alert('ダウンロードリンクが見つかりませんでした。');
            }
        } catch (error: any) {
            console.error("Download Error:", error);
            alert('ダウンロードに失敗しました: ' + error.message);
        }
    };

    return {
        attachments,
        uploading,
        statusMessage,
        uploadFile,
        removeFile,
        clearFiles,
        checkLoginStatus,
        login,
        downloadFileFromOneDrive,
        isAuthenticated,
    };
}
