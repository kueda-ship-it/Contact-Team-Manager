import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export const Login: React.FC = () => {
    const { authError } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Supabase Auth
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    const handleMicrosoftSignIn = async () => {
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    scopes: 'email openid profile offline_access Files.ReadWrite',
                    // Force the correct path if we are on GitHub Pages
                    redirectTo: window.location.hostname.includes('github.io')
                        ? 'https://kueda-ship-it.github.io/Contact-Team-Manager/'
                        : window.location.origin,
                }
            });

            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div id="auth-container" className="container" style={{ maxWidth: '400px', paddingTop: '100px' }}>
            <section className="form-container">
                <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>ログイン / サインアップ</h2>
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>ユーザー ID / メールアドレス</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="example@mail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>パスワード</label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {(error || authError) && (
                        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center', whiteSpace: 'pre-wrap' }}>
                            {error || authError}
                        </p>
                    )}

                    <div style={{ display: 'grid', gap: '10px', marginTop: '1.5rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'ログイン中...' : 'ログイン'}
                        </button>

                        <button type="button" className="btn" onClick={handleMicrosoftSignIn} disabled={loading} style={{ background: '#2F2F2F', color: 'white', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            <svg width="20" height="20" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="11" height="11" fill="#F25022" />
                                <rect x="12" width="11" height="11" fill="#7FBA00" />
                                <rect y="12" width="11" height="11" fill="#00A4EF" />
                                <rect x="12" y="12" width="11" height="11" fill="#FFB900" />
                            </svg>
                            {loading ? 'サインイン中...' : 'Microsoft でサインイン'}
                        </button>

                        <div style={{ textAlign: 'center', margin: '10px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>または</div>
                        <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.1)' }}>メールアドレスで新規登録</button>
                    </div>
                </form>
            </section>
        </div>
    );
};
