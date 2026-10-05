import { Component, type ReactNode } from 'react';
import { ErrorPage } from '../pages/ErrorPage';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ErrorPage status={500} /> : this.props.children;
  }
}
