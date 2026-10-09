import { Component, type ReactNode } from 'react';
import { ErrorPage } from '../pages/ErrorPage';

export class AppErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <ErrorPage status={500} /> : this.props.children;
  }
}
