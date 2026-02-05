import { useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Attachment {
    id?: string;
    name: string;
    url: string;
    thumbnailUrl?: string; // Support for OneDrive thumbnails
    type: string;
    size: number;
    storageProvider?: 'supabase' | 'onedrive';
}

export function useFileUpload() {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);

    const uploadFile = async (file: File, userId: string): Promise<Attachment | null> => {
        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${userId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('uploads')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('uploads')
                .getPublicUrl(filePath);

            const newAttachment: Attachment = {
                name: file.name,
                url: publicUrl,
                type: file.type,
                size: file.size,
                storageProvider: 'supabase'
            };

            setAttachments(prev => [...prev, newAttachment]);
            return newAttachment;

        } catch (error: any) {
            alert('アップロードに失敗しました: ' + error.message);
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

    return {
        attachments,
        uploading,
        uploadFile,
        removeFile,
        clearFiles
    };
}
