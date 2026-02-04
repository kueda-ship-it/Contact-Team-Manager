import { useState } from 'react';
import { msalInstance, loginRequest, getGraphClient, ensureMsalInitialized } from '../lib/microsoftGraph';
import { Attachment } from './useFileUpload';

export function useOneDriveUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);

    const login = async () => {
        try {
            await ensureMsalInitialized();
            // Using redirect instead of popup for better stability
            await msalInstance.loginRedirect(loginRequest);
            return null; // The page will redirect
        } catch (error) {
            console.error("Microsoft login failed:", error);
            alert("Microsoft アカウントでのログインに失敗しました。");
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
                account = await login();
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

            const newAttachment: Attachment = {
                id: driveItem.id,
                name: file.name,
                url: linkResponse.link.webUrl,
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
