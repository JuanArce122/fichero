import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Si una pantalla falla, muestra qué pasó (en vez de dejarla en blanco) y deja
 * seguir usando el resto de la app. Tus datos no se tocan.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en pantalla', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    // Al cambiar de pantalla se vuelve a intentar.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${navigator.userAgent}\n${(error.stack ?? '').split('\n').slice(0, 4).join('\n')}`;
    return (
      <div className="page">
        <div className="empty">
          <h2>Algo salió mal en esta pantalla</h2>
          <p>Tus datos están a salvo. Prueba recargar; si se repite, envíame una captura de este mensaje.</p>
          <pre className="error-details">{details}</pre>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Recargar
            </button>
            <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
    );
  }
}
