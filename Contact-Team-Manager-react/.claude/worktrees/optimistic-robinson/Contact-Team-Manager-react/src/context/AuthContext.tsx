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
    loading: boolean;
    authError: string | null;
    signIn: (email: string, password: string) => Promise<{ data: { user: User | null; session: Session | null; }; error: any }>;
    signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;
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
        try {
            // Check if we already have the profile for this user
            if (profile && profile.id === userId) return;

            let { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                // If not found by ID, check if this email is in our 'whitelist'
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (currentUser?.email) {
                    const { data: whitelistData, error: whitelistError } = await supabase
                        .from('whitelist')
                        .select('*')
                        .eq('email', currentUser.email)
                        .single();

                    if (!whitelistError && whitelistData) {
                        // Authorized email! Now we can safely create the formal profile
                        // using the real auth userId.
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
                            // Optionally remove from whitelist after successful onboarding
                            await supabase.from('whitelist').delete().eq('email', currentUser.email);

                            data = newProfile;
                            error = null as any;
                        }
                    }
                }
            }

            if (error) {
                // Still no profile and not in whitelist
                await signOut();
                setAuthError('このアカウントは許可されていません。管理者に登録を依頼してください。');
                return;
            }

            if (data && data.is_active === false) {
                await signOut();
                setAuthError('このアカウントは現在無効化されています。管理者に問い合わせてください。');
                return;
            }

            setProfile(data);
            setAuthError(null);
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
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
        setProfile(null);
        return { error };
    }

    return (
        <AuthContext.Provider value={{ user, profile, loading, authError, signIn, signOut }}>
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
