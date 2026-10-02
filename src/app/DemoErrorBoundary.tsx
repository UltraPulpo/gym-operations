import { Component, Fragment, createRef } from 'react';
import type { PropsWithChildren } from 'react';
import { Alert, Button } from '../shared';
import styles from './App.module.css';

export class DemoErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean; generation: number }
> {
  state = { failed: false, generation: 0 };
  private heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    if (this.state.failed) this.heading.current?.focus();
  }

  componentDidUpdate() {
    if (this.state.failed) this.heading.current?.focus();
  }

  private recover = () => {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#/`,
    );
    this.setState((state) => ({
      failed: false,
      generation: state.generation + 1,
    }));
  };

  render() {
    return (
      <div className={styles.app}>
        <header className={styles.header}>
          <p className={styles.brand}>Fitness Junkie Gym Operations</p>
          <p className={styles.disclaimer}>
            Fictional data only. No live authentication, email, backend, durable
            storage, or workout metrics. Demo changes stay in memory and reset
            on refresh. Do not use this demo to operate classes.
          </p>
        </header>
        <p className={styles.boundary}>SIMULATED DEMO - NOT FOR OPERATIONS</p>
        {this.state.failed ? (
          <main className={styles.content}>
            <h1 ref={this.heading} tabIndex={-1}>
              Demo recovery
            </h1>
            <Alert>
              An unexpected UI error interrupted this fictional demo. No
              authoritative data was changed. Recovery discards local demo edits
              and restores the overview, default persona, and frozen clock.
            </Alert>
            <Button onClick={this.recover}>
              Recover with fresh fictional state
            </Button>
          </main>
        ) : (
          <Fragment key={this.state.generation}>{this.props.children}</Fragment>
        )}
      </div>
    );
  }
}
