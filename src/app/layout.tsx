import type { ReactNode } from "react";

export const metadata = {
  title: "Workout Loop",
  description: "Private workout generator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
