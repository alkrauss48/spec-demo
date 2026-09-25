import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  href?: undefined;
};

type LinkProps = {
  variant?: Variant;
  href: string;
  children: ReactNode;
  className?: string;
};

/** A native `<button>`, or an `<a>` when `href` is given. */
export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'primary', className, ...rest } = props;
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  if (typeof rest.href === 'string') {
    return (
      <a href={rest.href} className={cls}>
        {rest.children}
      </a>
    );
  }
  const { type = 'button', ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type={type} className={cls} {...buttonProps} />;
}
