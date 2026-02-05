import { useState } from 'react';
import { msalInstance, getGraphClient, ensureMsalInitialized, login as msLogin } from '../lib/microsoftGraph';
import { Attachment } from './useFileUpload';

export function useOneDriveUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);

    const login = async () => {
        try {
            return await msLogin();
        } catch (error: any) {
            console.error("Microsoft login failed:", error);
            alert(`Microsoft アカウントでのログインに失敗しました。\nエラー: ${error.message || error}`);
            return null;
        }
    };

    const uploadFile = async (file: File): Promise<Attachment | null> => {
        setUploading(true);
        try {
            // Wait for MSAL to be ready (including processing redirects)
            await ensureMsalInitialized();

            // Check if logged in
            let account = msalInstance.getActiveAccount();
            if (!account) {
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    msalInstance.setActiveAccount(accounts[0]);
                    account = accounts[0];
                } else {
                    account = await login();
                }
                if (!account) throw new Error("Not logged in to Microsoft");
            }

            const client = await getGraphClient();

            // Upload to a dedicated folder
            const fileName = `${Date.now()}_${file.name}`;
            const folderPath = "/Apps/TeamsTaskManager/Attachments";
            const itemPath = `${folderPath}/${fileName}`;

            // 1. Create upload session (better for all file sizes)
            const uploadSession = await client
                .api(`/me/drive/root:${itemPath}:/createUploadSession`)
                .post({
                    item: {
                        "@microsoft.graph.conflictBehavior": "rename"
                    }
                });

            // 2. Perform the upload
            // Note: For production, you might want to slice large files.
            // For now, simpler implementation:
            const response = await fetch(uploadSession.uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Range': `bytes 0-${file.size - 1}/${file.size}`
                }
            });

            if (!response.ok) throw new Error("Upload failed");
            const driveItem = await response.json();

            // 3. Create a sharing link (view link)
            const linkResponse = await client
                .api(`/me/drive/items/${driveItem.id}/createLink`)
                .post({
                    type: "view",
                    scope: "anonymous" // Or "organization" depending on policy
                });

            // 4. Fetch thumbnails for images
            let thumbnailUrl = undefined;
            if (file.type.startsWith('image/')) {
                try {
                    const thumbResponse = await client.api(`/me/drive/items/${driveItem.id}/thumbnails`).get();
                    if (thumbResponse.value && thumbResponse.value.length > 0) {
                        // Priority: large > medium > small
                        const thumb = thumbResponse.value[0];
                        thumbnailUrl = thumb.large?.url || thumb.medium?.url || thumb.small?.url;
                        console.log("Thumbnail URL fetched:", thumbnailUrl);
                    }
                } catch (thumbError) {
                    console.warn("Failed to fetch thumbnails:", thumbError);
                }
            }

            const newAttachment: Attachment = {
                id: driveItem.id,
                name: file.name,
                url: linkResponse.link.webUrl,
                thumbnailUrl: thumbnailUrl,
                type: file.type,
                size: file.size,
                storageProvider: 'onedrive'
            };

            setAttachments(prev => [...prev, newAttachment]);
            return newAttachment;

        } catch (error: any) {
            console.error("OneDrive upload error:", error);
            alert("OneDrive へのアップロードに失敗しました: " + error.message);
            return null;
        } finally {
            setUploading(false);
        }
    };

    const removeFile = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const clearFiles = () => {
        setAttachments([]);
    };

    const downloadFileFromOneDrive = async (itemId: string, fileName: string) => {
        try {
            await ensureMsalInitialized();
            const client = await getGraphClient();

            // Get the item which includes the @microsoft.graph.downloadUrl
            const item = await client.api(`/me/drive/items/${itemId}`).get();
            const downloadUrl = item["@microsoft.graph.downloadUrl"];

            if (!downloadUrl) throw new Error("Download URL not found");

            // Trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error: any) {
            console.error("Download failed:", error);
            alert("ダウンロードに失敗しました: " + error.message);
        }
    };

    return {
        attachments,
        uploading,
        uploadFile,
        removeFile,
        clearFiles,
        downloadFileFromOneDrive
    };
}
