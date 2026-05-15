// Minimal layout for the widget — no app chrome (no header, no nav).
// Allows iframe embedding from any origin via X-Frame-Options not set.
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
