import React from "react";

interface State {
  hasError: boolean;
}

export class WhatsAppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro ao carregar o WhatsApp. Tente novamente.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
