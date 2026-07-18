import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Surfaces the real error in the console instead of failing silently
        console.error('Uncaught error in app:', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px',
                    fontFamily: 'system-ui, sans-serif',
                    background: '#f0f2f5',
                    color: '#2d2d2d',
                }}>
                    <h2>Something went wrong</h2>
                    <p style={{ color: '#d63031', maxWidth: 600, textAlign: 'center' }}>
                        {this.state.error.message || String(this.state.error)}
                    </p>
                    <button
                        onClick={() => window.location.assign('/student')}
                        style={{
                            marginTop: 20, padding: '10px 24px', background: '#6c5ce7',
                            color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
                        }}
                    >
                        Back to Dashboard
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;