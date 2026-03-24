import React, { createContext, useContext, useEffect, useState } from 'react';
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
                    return prev;
                });
                // If we have a user but no profile (e.g. page refresh), fetch it
                if (!profile && session.user) {
                    loadProfile(session.user.id);
                }
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

    async function loadProfile(userId: string) {
        console.log(`[AuthContext] Starting loadProfile for user: ${userId}`);
        try {
            // Check if we already have the profile for this user
            if (profile && profile.id === userId) {
                console.log('[AuthContext] Profile already loaded.');
                return;
            }

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
                        .eq('email', currentUser.email)
                        .single();

                    if (existingProfile) {
                        // Profile exists with old auth ID - update it to new auth ID
                        console.log('[AuthContext] Found existing profile with email, updating ID...');
                        const { data: updatedProfile, error: updateError } = await supabase
                            .from('profiles')
                            .update({ id: userId })
                            .eq('email', currentUser.email)
                            .select()
                            .single();
                        if (!updateError) {
                            data = updatedProfile;
                            error = null as any;
                        }
                    } else {
                        // Step 2: Check whitelist for new user onboarding
                        console.log('[AuthContext] Checking whitelist...');
                        const { data: whitelistData, error: whitelistError } = await supabase
                            .from('whitelist')
                            .select('*')
                            .eq('email', currentUser.email)
                            .single();

                        if (!whitelistError && whitelistData) {
                            console.log('[AuthContext] User in whitelist, creating profile...');
                            const { data: newProfile, error: createError } = await supabase
                                .from('profiles')
                                .insert({
                                    id: userId,
                                    email: currentUser.email,
                                    display_name: currentUser.email.split('@')[0],
                                    role: 'Member',
                                    is_active: true
                                })
                                .select()
                                .single();
                            if (!createError) {
                                await supabase.from('whitelist').delete().eq('email', currentUser.email);
                                data = newProfile;
                                error = null as any;
                            }
                        } else {
                            // Not in whitelist → unauthorized
                            await signOut();
                            setAuthError('このアカウントは許可されていません。管理者に登録を依頼してください。');
                            return;
                        }
                    }
                }
            } else if (error && !isNotFound) {
                // Network or other transient error - don't logout, just log and continue
                console.warn('[AuthContext] Transient error loading profile, will retry on next auth event:', error);
            }

            if (!data && isNotFound) {
                // Still no profile after all fallbacks
                console.error('[AuthContext] Still no profile after fallback.');
                await signOut();
                setAuthError('このアカウントは許可されていません。管理者に登録を依頼してください。');
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
