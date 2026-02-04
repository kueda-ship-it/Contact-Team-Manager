// Core type definitions for Contact Team Manager

export interface Profile {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    role: 'Admin' | 'Manager' | 'Member' | 'Viewer';
    created_at: string;
    updated_at?: string;
}

export interface Team {
    id: number;
    name: string;
    description?: string;
    icon?: string;
    created_at: string;
    order_index: number;
}

export interface TagData {
    id: number;
    name: string;
    color?: string;
    created_at: string;
}

export interface TagMember {
    tag_id: number;
    profile_id: string;
    role?: string;
}

export interface TeamMember {
    team_id: number;
    profile_id: string;
    role?: string;
}

export interface Attachment {
    name: string;
    url: string;
    type: string;
    size?: number;
}

export interface Reply {
    id: string;
    thread_id: string;
    content: string;
    author: string;
    created_at: string;
    updated_at?: string;
    attachments?: Attachment[];
}

export interface Reaction {
    id: string;
    target_id: string;
    target_type: 'thread' | 'reply';
    emoji: string;
    profile_id: string;
    created_at: string;
}

export interface Thread {
    id: string;
    title: string;
    content: string;
    author: string;
    author_name: string;
    team_id: number;
    status: 'pending' | 'completed';
    is_pinned: boolean;
    completed_by?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
    replies?: Reply[];
    reactions?: Reaction[];
}

export interface Whitelist {
    id: number;
    email: string;
    created_at: string;
}

// Filter and sort types
export type ThreadStatus = 'all' | 'pending' | 'completed';
export type FeedFilter = 'all' | 'pending' | 'assigned';
export type SortOrder = 'asc' | 'desc';

// Component prop types
export interface MentionTarget {
    type: 'profile' | 'tag';
    id: string | number;
    name: string;
    displayName: string;
}
