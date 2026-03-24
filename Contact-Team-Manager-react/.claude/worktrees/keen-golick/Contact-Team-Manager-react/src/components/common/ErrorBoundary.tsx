import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', backgroundColor: '#1E1E1E', color: '#ff6b6b', height: '100vh', width: '100vw', boxSizing: 'border-box', overflowY: 'auto' }}>
                    <h2>アプリでエラーが発生しました</h2>
                    <p>この画面のスクリーンショットを管理者に報告してください。</p>
                    <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '5px', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                        <strong>Message:</strong> {this.state.error?.toString()}
                    </div>
                    {this.state.errorInfo && (
                        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '5px', wordBreak: 'break-all', whiteSpace: 'pre-wrap', fontSize: '0.8em' }}>
                            <strong>Component Stack:</strong>
                            <br />
                            {this.state.errorInfo.componentStack}
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
