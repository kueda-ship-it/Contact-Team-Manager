import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Define Profile interface here or import from a types file if available
export interface Profile {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    role: 'Admin' | 'Manager' | 'Member' | 'Viewer';
    is_active: boolean;
    created_at: string;
    updated_at?: string;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    session: Session | null;
    loading: boolean;
    authError: string | null;
    signIn: (email: string, password: string) => Promise<{ data: { user: User | null; session: Session | null; }; error: any }>;
    signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    // Prevent concurrent loadProfile calls (race condition with SSO callbacks)
    const profileLoadingRef = useRef<string | null>(null);

    useEffect(() => {
        let mounted = true;

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;
            setSession(session);
            if (session?.user) {
                setUser(session.user);
                loadProfile(session.user.id);
            } else {
                setUser(null);
                setProfile(null);
                setLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return;
            setSession(session);

            if (session?.user) {
                // Only update if user changed to avoid unnecessary re-fetches
                setUser(prev => {
                    if (prev?.id !== session.user.id) {
                        setAuthError(null);
                        loadProfile(session.user.id);
                        return session.user;
                    }
                    // Same user: load profile if missing (e.g. page refresh after token refresh)
                    if (!profile) {
                        loadProfile(session.user.id);
                    }
                    return prev;
                });
            } else {
                setUser(null);
                setProfile(null);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // employee-master などの他アプリから role / display_name などが更新された際に、
    // 自分の profile state をリアルタイムで追従させる。
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`contact-team:profile:${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
                (payload) => {
                    const row = payload.new as Partial<Profile>;
                    setProfile((prev) => (prev ? { ...prev, ...row } : prev));
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    async function loadProfile(userId: string) {
        // Prevent concurrent loads for the same user (SSO race condition fix)
        if (profileLoadingRef.current === userId) {
            console.log('[AuthContext] Profile load already in progress, skipping.');
            return;
        }
        profileLoadingRef.current = userId;
        console.log(`[AuthContext] Starting loadProfile for user: ${userId}`);
        try {

            let { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            // PGRST116 = "no rows returned" (not found). Other errors are network/transient - don't logout for those.
            const isNotFound = error?.code === 'PGRST116';

            if (error && isNotFound) {
                console.warn('[AuthContext] Profile not found, checking fallback...');
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (currentUser?.email) {
                    // Step 1: Check if a profile with this email already exists (Microsoft SSO re-login)
                    const { data: existingProfile } = await supabase
                        .from('profiles')
                        .select('*')
                        .ilike('email', currentUser.email)
                        .single();

                    if (existingProfile) {
                        // Profile exists (admin pre-registered or old auth ID) - update to new auth ID and activate
                        console.log('[AuthContext] Found existing profile with email, updating ID and activating...');
                        const { data: updatedProfile, error: updateError } = await supabase
                            .from('profiles')
                            .update({ id: userId, is_active: true })
                            .ilike('email', currentUser.email)
                            .select()
                            .single();
                        if (!updateError) {
                            data = updatedProfile;
                            error = null as any;
                        }
                    } else {
                        // No profile found → admin has not added this user yet
                        await signOut();
                        setAuthError('このアカウントはシステムに登録されていません。管理者に追加を依頼してください。');
                        return;
                    }
                }
            } else if (error && !isNotFound) {
                // Network or other transient error - don't logout, just log and continue
                console.warn('[AuthContext] Transient error loading profile, will retry on next auth event:', error);
            }

            if (!data && isNotFound) {
                // Profile update failed after email match
                console.error('[AuthContext] Still no profile after fallback.');
                await signOut();
                setAuthError('アカウントの有効化に失敗しました。管理者に問い合わせてください。');
                return;
            }

            if (data && data.is_active === false) {
                console.warn('[AuthContext] Account is inactive.');
                await signOut();
                setAuthError('このアカウントは現在無効化されています。管理者に問い合わせてください。');
                return;
            }

            setProfile(data);
            setAuthError(null);
        } catch (error) {
            console.error('[AuthContext] Error loading profile:', error);
        } finally {
            profileLoadingRef.current = null;
            console.log('[AuthContext] loadProfile finished. Setting loading to false.');
            setLoading(false);
        }
    }

    async function signIn(email: string, password: string) {
        setAuthError(null);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { data, error };
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        return { error };
    }

    const value = React.useMemo(() => ({
        user,
        profile,
        session,
        loading,
        authError,
        signIn,
        signOut
    }), [user, profile, session, loading, authError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within a AuthProvider');
    }
    return context;
};
