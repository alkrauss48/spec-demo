import type { ReactNode } from 'react';

const style = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Text for assistive technology only. */
export function VisuallyHidden({
  children,
  as: Tag = 'span',
}: {
  children: ReactNode;
  as?: 'span' | 'h1';
}) {
  return <Tag style={style}>{children}</Tag>;
}
