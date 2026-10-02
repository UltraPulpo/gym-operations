import type { ReactNode } from 'react';
import styles from './shared.module.css';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusBadgeProps {
  children: string;
  tone?: StatusTone;
}

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

export interface AlertProps {
  children: ReactNode;
  title?: string;
  tone?: StatusTone;
}

export function Alert({ children, title, tone = 'danger' }: AlertProps) {
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={`${styles.alert} ${styles[tone]}`}
    >
      {title && <p className={styles.alertTitle}>{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" className={styles.loading}>
      {label}
    </div>
  );
}

export interface UnavailableStateProps {
  title?: string;
  message: string;
  children?: ReactNode;
}

export function UnavailableState({
  title = 'Data unavailable',
  message,
  children,
}: UnavailableStateProps) {
  return (
    <Alert title={title}>
      <p>{message}</p>
      {children}
    </Alert>
  );
}

export interface UnsupportedOperationProps {
  message: string;
}

export function UnsupportedOperation({ message }: UnsupportedOperationProps) {
  return <Alert title="Not supported in this prototype">{message}</Alert>;
}
